let currentArgv = process.argv

export function setCurrentArgv(argv: string[]) {
  currentArgv = argv
}

export function getCurrentArgv() {
  return currentArgv
}
