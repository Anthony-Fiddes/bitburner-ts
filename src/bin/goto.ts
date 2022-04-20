import { NS } from "Bitburner"
import { getServerConnectString, goto } from "/lib/Hack"

export async function main(ns: NS) {
  if (ns.args.length !== 1) {
    ns.tprint("ERROR goto.ts takes at least one argument.")
    ns.tprint(
      "use goto.ts to generate a command that will take you to a server",
    )
  }
  const target = ns.args[0].toString()
  if (goto(ns, target)) {
    return
  }
  const connectString = getServerConnectString(ns, target, ns.getHostname())
  if (connectString === "") {
    ns.tprint(`Could not find a path to ${target}. Maybe check the logs?`)
  }
  ns.tprintf("Copy the string below to get to %s", target)
  ns.tprint(connectString)
}
