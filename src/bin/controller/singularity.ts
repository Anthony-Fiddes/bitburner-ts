import { NS } from "Bitburner"
import { execWait, goto, hasSourceFile } from "/lib/Hack"

interface MoneyOption {
  GetMoneyPerSecond(): number
  Do(): void
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

export async function main(ns: NS) {
  const hasSingularityAccess =
    hasSourceFile(ns, 4) || ns.getPlayer().bitNodeN === 4
  if (ns.singularity.isBusy() || !hasSingularityAccess) {
    return
  }

  await execWait(ns, "/bin/controller/getDarkweb.js", 1)
  await execWait(ns, "/bin/controller/joinFactions.js", 1)

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
