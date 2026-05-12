function quoteArg(argument: string | number) {
  const value = String(argument)
  if (value === '') {
    return '""'
  }

  return /^[A-Za-z0-9_/:=@%+.,-]+$/.test(value) ? value : JSON.stringify(value)
}

export function formatCommand(command: string, args: Array<string | number> = []) {
  return [command, ...args].map(quoteArg).join(' ')
}
