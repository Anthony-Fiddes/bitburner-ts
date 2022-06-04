import { NS } from "Bitburner"
import { buyHacknetUpgrades, getHacknetProduction } from "lib/Hacknet"
import { Distributor, getServers, execWait } from "lib/Hack"

async function handleDistributor(dist: Distributor) {
  dist.setWorkers(getWorkers(dist.ns))
  dist.setTargets(getServers(dist.ns))
  await dist.share()
}

function handleHacknet(ns: NS, minBalance: number) {
  const hacknetProd = getHacknetProduction(ns)
  const hackProd = ns.getScriptIncome()[0]
  const hackFactor = 10
  if (hackProd / hacknetProd > hackFactor) {
    return
  }
  buyHacknetUpgrades(ns, minBalance)
}

function getWorkers(ns: NS) {
  return new Set(["home", ...getServers(ns), ...ns.getPurchasedServers()])
}

function seconds(num: number) {
  return num * 1000
}

export class Controller {
  ns: NS
  dist: Distributor
  minBalance = 0
  peakBalance = 0
  step = seconds(10)

  constructor(ns: NS) {
    this.ns = ns
    this.dist = new Distributor(ns, getWorkers(ns), getServers(ns))
  }

  async run() {
    // execWait commands simply will not run if there is not enough RAM
    while (true) {
      this.updateBalanceInfo()
      await execWait(this.ns, "/bin/controller/singularity.js", 1)
      await handleDistributor(this.dist)
      handleHacknet(this.ns, this.minBalance)
      await this.ns.sleep(this.step)
    }
  }

  /** Ensures that we keep a min balance that is 30% of the highest balance
   *  we've ever attained. This reserve is useful for manually purchasing upgrades.
   */
  updateBalanceInfo() {
    const moneyAvailable = this.ns.getServerMoneyAvailable("home")
    if (moneyAvailable > this.peakBalance) {
      this.peakBalance = moneyAvailable
      this.minBalance = this.peakBalance * 0.3
    }
  }
}
