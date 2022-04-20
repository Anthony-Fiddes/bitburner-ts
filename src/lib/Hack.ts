import { NS, SourceFileLvl } from "Bitburner"
import Logger from "lib/Logger"

const logger = new Logger("hack.js")

export const BASIC = "basic_hack.js"
export const HACK = "/forever/hack.js"
export const GROW = "/forever/grow.js"
export const WEAKEN = "/forever/weaken.js"

export class Distributor {
  /**
   * how long each rebalance should last
   */
  rebalanceDuration = 1000 * 60 * 60 * 3
  rebalanceTime = Date.now() + this.rebalanceDuration
  /**
   * A set of servers that may be targeted.
   * They will be checked for root privilege
   */
  targets: Set<string>
  /**
   * A set of servers that may run scripts.
   * They will be checked for root privilege
   */
  workers: Set<string>
  /**
   * the number of threads allocated to each target server
   * @todo consider using the Map<string, number> type instead
   */
  threads: { [key: string]: number } = {}
  ns: NS
  ratios = {
    hack: 1,
    grow: 11,
    weaken: 8,
  }
  currentRatios = { ...this.ratios }
  /**
   * Currently, this way of tweaking things is a bit annoying because
   * the full server may not get used if a batch size is too small.
   * This is because a script cannot run with the same args on the
   * same server! This is annoying on home with a ton of RAM
   *
   * My ideal solution would be to batch all of the threads and execute
   * them AFTER calculating where they should go instead of during.
   */
  maxThreadsPerTarget = 50
  growthRate = 100
  staggerTime = 10

  constructor(ns: NS, workers: Set<string>, targets: Set<string>) {
    this.targets = targets
    this.workers = workers
    this.ns = ns
    this.#killallWorkers()
  }

  #killallWorkers() {
    for (const server of this.workers) {
      if (server != "home") {
        this.ns.killall(server)
      } else {
        this.ns.print("You may want to run killall on home...")
      }
      this.threads[server] = 0
    }
  }

  setWorkers(workers: Set<string>) {
    this.workers = workers
  }

  setTargets(targets: Set<string>) {
    this.targets = targets
    for (const target of targets) {
      if (this.threads[target] !== undefined) {
        continue
      }
      this.threads[target] = 0
    }
  }

  /**
   * Share distributes hack(), weaken() and grow()
   * calls to all of a Distributor's servers
   */
  async share() {
    // rebalance if needed
    if (Date.now() > this.rebalanceTime) {
      this.ns.print("Rebalancing distributor:")
      this.#killallWorkers()
      this.maxThreadsPerTarget *= 1.2
      this.rebalanceTime = Date.now() + this.rebalanceDuration
    }

    for (const server of this.workers) {
      await this.#gobble(server)
    }
    this.ns.print("Distributor threads: ", this.threads)
    return
  }

  async #gobble(server: string) {
    if (!this.ns.hasRootAccess(server)) {
      attemptRoot(this.ns, server)
      return
    }
    let availableRAM =
      this.ns.getServerMaxRam(server) - this.ns.getServerUsedRam(server)
    if (server == "home") {
      // leave home some ram
      const extraRAM = 36
      availableRAM -= extraRAM
    }
    let hacks = 0
    const hackRAM = this.ns.getScriptRam(HACK)
    let grows = 0
    const growRAM = this.ns.getScriptRam(GROW)
    let weakens = 0
    const weakenRAM = this.ns.getScriptRam(WEAKEN)

    const addThreadBatch = async () => {
      const target = this.getTarget()
      await this.assignThreads(server, target, grows, GROW)
      await this.assignThreads(server, target, hacks, HACK)
      await this.assignThreads(server, target, weakens, WEAKEN)
      grows = 0
      hacks = 0
      weakens = 0
    }

    while (availableRAM > Math.max(hackRAM, growRAM, weakenRAM)) {
      if (this.currentRatios.hack > 0) {
        this.currentRatios.hack--
        availableRAM -= hackRAM
        hacks++
      } else if (this.currentRatios.weaken > 0) {
        this.currentRatios.weaken--
        availableRAM -= weakenRAM
        weakens++
      } else if (this.currentRatios.grow > 0) {
        this.currentRatios.grow--
        availableRAM -= growRAM
        grows++
      } else {
        this.currentRatios = { ...this.ratios }
      }
      if (grows + hacks + weakens >= this.maxThreadsPerTarget) {
        await addThreadBatch()
      }
    }
    await addThreadBatch()
  }

  async assignThreads(
    worker: string,
    target: string,
    numThreads: number,
    script: string,
  ) {
    if (numThreads <= 0) {
      return
    }
    await exec(this.ns, script, worker, numThreads, target)
    this.threads[target] += numThreads
    await this.ns.sleep(this.staggerTime)
  }

  getTarget(times?: number): string {
    const maxRecursions = 3
    if (times === undefined) {
      times = 1
    }
    let maxMoney = 0
    let target = ""
    for (const server of this.targets) {
      if (!this.ns.hasRootAccess(server)) {
        attemptRoot(this.ns, server)
        continue
      }
      if (
        this.ns.getServerRequiredHackingLevel(server) >
        this.ns.getHackingLevel()
      ) {
        continue
      }
      const m = this.ns.getServerMaxMoney(server)
      if (
        this.threads[server] >= this.maxThreadsPerTarget ||
        m <= maxMoney ||
        m == 0
      ) {
        this.ns.print(server + ": " + this.threads[server])
        continue
      }
      maxMoney = m
      target = server
    }
    if (target === "") {
      if (times > maxRecursions) {
        this.ns.print("Is there at least one valid target?")
        this.ns.print("You may want to consider increasing your growth rate.")
        throw new Error("Distributor could not find a valid target")
      }
      this.maxThreadsPerTarget += this.growthRate
      this.ns.printf(
        "Distributor increasing maximum allowed threads per target by %d",
        this.growthRate,
      )
      return this.getTarget(times++)
    }
    return target
  }
}

/**
 *  @returns servers that we can connect to
 */
export function getServers(ns: NS): Set<string> {
  const servers = new Set<string>()
  getServerNodes(ns).forEach((n) => servers.add(n.hostname))
  return servers
}

type node = { prev?: node; hostname: string }

/**
 * @param stop the server to stop the search at
 */
function getServerNodes(ns: NS, stop?: string) {
  let search: node[] = [{ hostname: "home" }]
  const servers: node[] = []
  const explored: Set<string> = new Set()
  while (search.length > 0) {
    const c = search.pop()
    if (c === undefined) {
      break
    }
    const curr = c
    if (explored.has(curr.hostname)) {
      continue
    }
    if (curr.hostname !== "home") {
      servers.push(curr)
    }
    const nextServers = ns.scan(curr.hostname).map((next): node => {
      return { prev: curr || null, hostname: next }
    })
    if (curr.hostname === stop) {
      break
    }
    search = search.concat(nextServers)
    explored.add(curr.hostname)
  }
  return servers
}

/**
 * @returns a string that allows the user to connect to a server. The string
 * will be empty if no path was found.
 */
export function getServerConnectString(ns: NS, end: string, start?: string) {
  if (start === undefined) {
    start = ns.getHostname()
  }
  const serverPath: string[] = []
  const nodes = getServerNodes(ns, end)
  let curr = nodes.find((n: node) => n.hostname === end)
  if (curr === undefined) {
    logger.printf(ns, "cannot find path to %s", end)
    return ""
  }
  let count = 0
  while (curr !== undefined && curr.hostname !== start) {
    serverPath.push(curr.hostname)
    if (curr.prev?.hostname === undefined) {
      break
    }
    curr = curr.prev
    if (count === 100) {
      ns.tprint("did not find connection string after 100 loops")
      return ""
    }
    count++
  }
  // We must reverse the array of servers because we started at the target
  serverPath.reverse()

  // Generate the string that the user will copy
  const connects: string[] = []
  for (const server of serverPath) {
    connects.push(`connect ${server};`)
  }
  const result = connects.join("")
  return result
}

export function goto(ns: NS, end: string) {
  let connectString = getServerConnectString(ns, end)
  connectString = connectString.replace("connect", "")
  const s = connectString.split(";").filter((str) => str !== "")
  const servers = s.map((hostname) => hostname.trim())
  throw "not implemented man"
}

/**
 * Attempts to get root access on the given @hostname
 * @returns true if nuke was successfully started,
 * otherwise false
 */
export function attemptRoot(ns: NS, hostname: string): boolean {
  if (!canGetRoot(ns, hostname)) {
    return false
  }

  try {
    if (ns.getServerNumPortsRequired(hostname) > 0) {
      ns.brutessh(hostname)
      ns.ftpcrack(hostname)
      ns.relaysmtp(hostname)
      ns.httpworm(hostname)
      ns.sqlinject(hostname)
    }
  } catch (error) {
    logger.printf(
      ns,
      "failed to use all port exploits on %v: %v",
      hostname,
      error,
    )
  }

  try {
    ns.nuke(hostname)
  } catch (error) {
    logger.printf(ns, "could not nuke %v: %v", hostname, error)
    return false
  }
  return true
}

/**
 * @param ns
 * @param hostname
 * @returns true if it is possible to get root access
 * on a machine, otherwise false
 */
function canGetRoot(ns: NS, hostname: string): boolean {
  let securityLevel
  try {
    securityLevel = ns.getServerRequiredHackingLevel(hostname)
  } catch (error) {
    logger.printf(ns, "could not get security level of %v: %v", hostname, error)
    return false
  }
  return securityLevel <= ns.getHackingLevel()
}

/**
 * Copy a script to the server hostname and run it.
 * @returns true if the script was successfully started, otherwise
 * false
 */
export async function exec(
  ns: NS,
  script: string,
  hostname: string,
  numThreads: number,
  ...args: string[]
) {
  if (!(await ns.scp(script, hostname))) {
    logger.printf(ns, "could not copy %s to %s", script, hostname)
    return false
  }
  let pid = ns.exec(script, hostname, numThreads, ...args)
  if (pid == 0) {
    logger.printf(
      ns,
      "failed to start %s on %s with %d threads: ns.exec",
      script,
      hostname,
      numThreads,
    )
    logger.print(ns, "do you have root?")
    return false
  }
  logger.printf(
    ns,
    "successfully started %s on %s with %d threads",
    script,
    hostname,
    numThreads,
  )
  return true
}

/**
 * Copy a script to the server hostname and run it using all of the
 * server's RAM.
 * @returns true if the script was successfully started, otherwise
 * false
 */
export async function gobble(
  ns: NS,
  script: string,
  hostname: string,
  ...args: string[]
): Promise<boolean> {
  const availableRAM =
    ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname)
  const numThreads = Math.floor(availableRAM / ns.getScriptRam(script))
  if (numThreads <= 0) {
    logger.printf(ns, "not enough RAM to start %s on %s", script, hostname)
    return false
  }
  return exec(ns, script, hostname, numThreads, ...args)
}

/**
 * @returns true if the player has the given source file
 */
export function hasSourceFile(ns: NS, num: number) {
  const sourceFile = ns
    .getOwnedSourceFiles()
    .find((sf: SourceFileLvl) => sf.n == num && sf.lvl > 0)
  if (sourceFile === undefined) {
    return false
  }
  return true
}
