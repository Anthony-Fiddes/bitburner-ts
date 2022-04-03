import { NS } from "Bitburner"
import { Controller } from "/lib/Controller"

export async function main(ns: NS) {
  const cont = new Controller(ns)
  await cont.run()
}
