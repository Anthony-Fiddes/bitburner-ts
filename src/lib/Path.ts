import { NS } from "Bitburner"

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // $& means the whole matched string
}

const hasFolderRegex = (path: string) =>
  new RegExp(`^\/?(${escapeRegExp(path)})`)

/** isFolder checks if the given path is a valid folder */
export function isFolder(ns: NS, path: string, host?: string): boolean {
  if (host === undefined) {
    host = ns.getHostname()
  }
  // if the path doesn't end with a '/', it's not a folder
  if (path.slice(-1) !== "/") {
    return false
  }

  // bitburner doesn't allow empty directories to exist
  const files = ns.ls(host, path)
  if (files.length == 0) {
    return false
  }

  // if the path starts at the beginning of a file name, it must be a valid
  // path!
  for (const file of files) {
    if (file.match(hasFolderRegex(path)) !== null) {
      return true
    }
  }
  return false
}

/** rm deletes a file or all of the files within a folder
 *  @returns true if all specified files were deleted
 */
export function rm(ns: NS, path: string, host?: string): boolean {
  if (host === undefined) {
    host = ns.getHostname()
  }

  if (ns.fileExists(path)) {
    return ns.rm(path, host)
  } else if (isFolder(ns, path)) {
    const candidates = ns.ls(host, path)
    return candidates.every((candidate) => {
      if (candidate.match(hasFolderRegex(path)) === null) {
        // if the candidate is not in the folder, we just move on
        return true
      }
      return rm(ns, candidate, host)
    })
  }
  ns.tprintf("%s does not exist", path)
  return false
}
