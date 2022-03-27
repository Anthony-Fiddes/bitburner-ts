import { NS } from "Bitburner"

export default class Logger {
  libName: string
  /**
   * Provides print and printf prepended with libName.
   **/
  constructor(libName: string) {
    this.libName = libName
  }

  /** Prints one or move values or variables to the script’s logs.
   *  @param ns
   **/
  print(ns: NS, ...args: any[]) {
    ns.print(this.libName, ": ", ...args)
  }

  /** Prints a formatted string to the script’s logs.
		@remarks RAM cost: 0 GB
			
		see: https://github.com/alexei/sprintf.js
		
		@param format format of the message
	    @param ns 
		@param args Value(s) to be printed. 
	**/
  printf(ns: NS, format: string, ...args: any[]) {
    ns.printf(this.libName + ": " + format, ...args)
  }
}
