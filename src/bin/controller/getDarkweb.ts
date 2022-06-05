import { NS } from "Bitburner"

export async function main(ns: NS) {
  // Buy the Tor router, get the port opener programs if possible
  if (!ns.getPlayer().tor) {
    ns.singularity.purchaseTor()
  }
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
}
