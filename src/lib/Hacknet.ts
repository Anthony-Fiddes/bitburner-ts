import { NS } from "Bitburner"
import Logger from "lib/Logger"

const logger = new Logger("hacknet.js")

/** Call func for every node in our hacknet. **/
export function forEachHacknetNode(ns: NS, func: (index: number) => void) {
  const numNodes = ns.hacknet.numNodes()
  for (let i = 0; i < numNodes; i++) {
    func(i)
  }
}

/** Get our hacknets' current money generated per second. **/
export function getHacknetProduction(ns: NS) {
  let total = 0
  forEachHacknetNode(ns, (i) => (total += ns.hacknet.getNodeStats(i).production))
  return total
}

function formulasExists(ns: NS) {
  return ns.fileExists("Formulas.exe", "home")
}

/** Buy as many hacknet upgrades as possible in order from least
 *  cost to greatest cost.
 *  minBalance stop buying upgrades when the player
 *  balance would fall below minBalance.
 *  TODO: consider adding an error return
 **/
export function buyHacknetUpgrades(ns: NS, minBalance: number) {
  if (minBalance < 0) {
    minBalance = 0
  }
  logger.print(
    ns,
    `buying hacknet node upgrades, but keeping balance above ${minBalance}`,
  )
  // Guarantee that we have at least one server that we can upgrade
  const balance = ns.getServerMoneyAvailable("home")
  const purchaseCost = ns.hacknet.getPurchaseNodeCost()
  if (ns.hacknet.numNodes() == 0) {
    logger.print(ns, "purchasing first hacknet node...")
    purchaseNode(ns)
    if (balance - purchaseCost <= minBalance) {
      return
    }
  }

  while (ns.getServerMoneyAvailable("home") > minBalance) {
    // refresh options
    let options = getOptions(ns)
    logger.print(
      ns,
      "top 3 upgrade option values: ",
      options
        .slice(0, 3)
        .map((opt) => opt.toString() + ": " + opt.getValue(ns)),
    )
    let opt = options[0]
    const balance = ns.getServerMoneyAvailable("home")
    if (balance - opt.getUpgradeCost(ns) < minBalance) {
      break
    }
    let success = options[0].do(ns)
    if (!success) {
      logger.printf(ns, "ERROR could not %s", opt.toString())
      logger.print(ns, "no longer buying upgrades")
      break
    } else {
      logger.print(ns, opt.toString())
    }
  }
}

/** @returns true if node was successfully purchased **/
function purchaseNode(ns: NS): boolean {
  let node = ns.hacknet.purchaseNode()
  if (node === -1) {
    logger.print(ns, "failed to purchase hacknet node")
    return false
  }
  logger.printf(ns, "purchased hacknet node %d", node)
  return true
}

function getOptions(ns: NS) {
  let options: UpgradeOption[] = []
  options.push(new UpgradeOption(Type.New, ns.hacknet.numNodes()))
  forEachHacknetNode(ns, (i) => {
    options.push(new UpgradeOption(Type.RAM, i))
    options.push(new UpgradeOption(Type.Level, i))
    options.push(new UpgradeOption(Type.Core, i))
  })
  if (formulasExists(ns)) {
    // sort from greatest to least value
    options.sort((opt, other) => other.getValue(ns) - opt.getValue(ns))
  } else {
    options.sort(
      (opt, other) => opt.getUpgradeCost(ns) - other.getUpgradeCost(ns),
    )
  }
  return options
}

// calculating upgrade costs is making me sad lmfao
class UpgradeOption {
  node: number
  type: Type

  constructor(type: Type, node: number) {
    this.type = type
    this.node = node
  }

  toString() {
    if (this.type === Type.New) {
      return "purchase node"
    }
    return `upgrade node #${this.node}'s ${this.type}`
  }

  // @returns true if successfully performs option
  do(ns: NS) {
    switch (this.type) {
      case Type.RAM:
        return ns.hacknet.upgradeRam(this.node, 1)
      case Type.Level:
        return ns.hacknet.upgradeLevel(this.node, 1)
      case Type.Core:
        return ns.hacknet.upgradeCore(this.node, 1)
      case Type.New:
        return purchaseNode(ns)
    }
  }

  /** @remarks do not use when the upgrade option is of new */
  #getNodeStats(ns: NS) {
    return ns.hacknet.getNodeStats(this.node)
  }

  getUpgradeCost(ns: NS) {
    if (!formulasExists(ns)) {
      switch (this.type) {
        case Type.RAM:
          return ns.hacknet.getRamUpgradeCost(this.node, 1)
        case Type.Level:
          return ns.hacknet.getLevelUpgradeCost(this.node, 1)
        case Type.Core:
          return ns.hacknet.getLevelUpgradeCost(this.node, 1)
        case Type.New:
          return ns.hacknet.getPurchaseNodeCost()
      }
    }
    const mults = ns.getHacknetMultipliers()
    switch (this.type) {
      case Type.RAM:
        return ns.formulas.hacknetNodes.ramUpgradeCost(
          this.#getNodeStats(ns).ram,
          1,
          mults.ramCost,
        )
      case Type.Level:
        return ns.formulas.hacknetNodes.levelUpgradeCost(
          this.#getNodeStats(ns).level,
          1,
          mults.levelCost,
        )
      case Type.Core:
        return ns.formulas.hacknetNodes.coreUpgradeCost(
          this.#getNodeStats(ns).cores,
          1,
          mults.coreCost,
        )
      case Type.New:
        return ns.formulas.hacknetNodes.hacknetNodeCost(
          this.node,
          mults.purchaseCost,
        )
    }
  }

  getValue(ns: NS): number {
    if (!formulasExists(ns)) {
      logger.printf(
        ns,
        "ERROR cannot calculate value for option (%s): Formulas.exe does not exist",
        this.toString(),
      )
      return 0
    }
    let prodGain = 0
    /** currentGain is a function because running it for the new option would error **/
    const currentGain = () => {
      return ns.formulas.hacknetNodes.moneyGainRate(
        this.#getNodeStats(ns).level,
        this.#getNodeStats(ns).ram,
        this.#getNodeStats(ns).cores,
        ns.getHacknetMultipliers().production,
      )
    }
    switch (this.type) {
      case Type.RAM:
        prodGain =
          ns.formulas.hacknetNodes.moneyGainRate(
            this.#getNodeStats(ns).level,
            this.#getNodeStats(ns).ram * 2,
            this.#getNodeStats(ns).cores,
            ns.getHacknetMultipliers().production,
          ) - currentGain()
        break
      case Type.Level:
        prodGain =
          ns.formulas.hacknetNodes.moneyGainRate(
            this.#getNodeStats(ns).level + 1,
            this.#getNodeStats(ns).ram,
            this.#getNodeStats(ns).cores,
            ns.getHacknetMultipliers().production,
          ) - currentGain()
        break
      case Type.Core:
        prodGain =
          ns.formulas.hacknetNodes.moneyGainRate(
            this.#getNodeStats(ns).level,
            this.#getNodeStats(ns).ram,
            this.#getNodeStats(ns).cores + 1,
            ns.getHacknetMultipliers().production,
          ) - currentGain()
        break
      case Type.New:
        prodGain = ns.formulas.hacknetNodes.moneyGainRate(
          1,
          1,
          1,
          ns.getHacknetMultipliers().production,
        )
        break
    }
    return prodGain / this.getUpgradeCost(ns)
  }
}

enum Type {
  New = "new",
  RAM = "RAM",
  Level = "level",
  Core = "core",
}
