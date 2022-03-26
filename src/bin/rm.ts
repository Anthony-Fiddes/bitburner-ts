import { NS } from "Bitburner"
import { isFolder, rm } from "/lib/Path"

/** @param {NS} ns **/
export async function main(ns: NS) {
  let targets: string[] = ns.args.map((t) => t.toString())
  if (targets.length < 1) {
    ns.tprint("ERROR rm.ts takes at least one argument.")
    ns.tprint("use rm.ts to delete files and directories")
  }

  for (const target of targets) {
    rm(ns, target)
  }
}
