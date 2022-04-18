import { NS } from "Bitburner"
import { buyUpgrades, getProduction } from "lib/Hacknet"
import { Distributor, getServers } from "lib/Hack"

async function handleDistributor(dist: Distributor) {
  dist.setWorkers(getWorkers(dist.ns))
  dist.setTargets(getServers(dist.ns))
  await dist.share()
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
      await handleDistributor(this.dist)
      buyUpgrades(this.ns, this.minBalance)
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
