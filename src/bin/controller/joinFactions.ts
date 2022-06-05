import { NS } from "Bitburner"
import { goto } from "/lib/Hack"

export async function main(ns: NS) {
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
}
