import { NS } from "Bitburner"
import { buyHacknetUpgrades, getHacknetProduction } from "lib/Hacknet"
import { Distributor, getServers, goto, hasSourceFile } from "lib/Hack"

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

async function handleSingularity(ns: NS) {
  interface MoneyOption {
    GetMoneyPerSecond(): number
    Do(): void
  }

  const hasSingularityAccess =
    hasSourceFile(ns, 4) || ns.getPlayer().bitNodeN === 4
  if (ns.singularity.isBusy() || !hasSingularityAccess) {
    return
  }

  // Buy the Tor router, get the port openers as soon as we can
  if (ns.getPlayer().tor) {
    let programs = ns.singularity.getDarkwebPrograms()
    const cost = ns.singularity.getDarkwebProgramCost
    programs = programs.filter((prog) => !ns.fileExists(prog, "home"))
    // sort from highest to lowest since pop takes from the back
    programs.sort((a, b) => cost(b) - cost(a))
    let prog: string | undefined = programs.pop()
    while (prog !== undefined) {
      if (!ns.singularity.purchaseProgram(prog)) {
        break
      }
      prog = programs.pop()
    }
  } else {
    ns.singularity.purchaseTor()
  }

  const factionServers = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"]
  const currentServer = ns.getHostname()
  const invites = ns.singularity.checkFactionInvitations()
  for (const hostname of factionServers) {
    const serv = ns.getServer(hostname)
    // attempt to join these key factions
    const faction = serv.organizationName
    if (invites.find((f) => f === faction)) {
      ns.singularity.joinFaction(faction)
    }
    // controller does not handle getting admin rights
    if (serv.backdoorInstalled || !serv.hasAdminRights) {
      continue
    }
    goto(ns, hostname)
    await ns.singularity.installBackdoor()
    goto(ns, currentServer)
  }

  class Crime implements MoneyOption {
    ns: NS
    crime: string

    constructor(ns: NS, crime: string) {
      this.ns = ns
      this.crime = crime
    }

    GetMoneyPerSecond(): number {
      const stats = this.ns.singularity.getCrimeStats(this.crime)
      const value =
        (stats.money * this.ns.singularity.getCrimeChance(this.crime)) /
        stats.time
      return value
    }

    Do(): void {
      this.ns.singularity.commitCrime(this.crime)
    }
  }

  // Find the highest value option that we can.
  let options: MoneyOption[] = []
  const c = [
    "heist",
    "assassination",
    "kidnap",
    "grand theft auto",
    "homicide",
    "larceny",
    "mug someone",
    "rob store",
    "shoplift",
  ]
  const crimes = c.map((str) => new Crime(ns, str))
  let bestCrime: Crime | null = null
  let maxValue = 0
  for (const crime of crimes) {
    const value = crime.GetMoneyPerSecond()
    if (value > maxValue) {
      maxValue = value
      bestCrime = crime
    }
  }
  if (bestCrime !== null) {
    options.push(bestCrime)
  }

  options.sort((a, b) => b.GetMoneyPerSecond() - a.GetMoneyPerSecond())
  const best = options.pop()
  if (best !== undefined) {
    best.Do()
  }
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
    while (true) {
      this.updateBalanceInfo()
      await handleSingularity(this.ns)
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
