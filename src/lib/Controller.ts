import { NS } from "Bitburner"
import { buyUpgrades, getProduction } from "lib/Hacknet"
import { Distributor, getServers } from "lib/Hack"

function handleHacknet(ns: NS, step: number) {
  // TODO: make this accumulate hacknet money if it wasn't spent
  // roughly use hacknet money for hacknet upgrades
  // const produced = (getProduction(ns) * step) / seconds(1)
  // TODO: Add seed money from hacking. Maybe also do a portion of hacking
  // income
  const minBal = ns.getServerMoneyAvailable("home") - 1e7
  buyUpgrades(ns, minBal)
}

async function handleDistributor(dist: Distributor) {
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
  step = seconds(10)

  constructor(ns: NS) {
    this.ns = ns
    this.dist = new Distributor(ns, getWorkers(ns), getServers(ns))
  }

  async run() {
    while (true) {
      await handleDistributor(this.dist)
      handleHacknet(this.ns, this.step)
      await this.ns.sleep(this.step)
    }
  }
}
