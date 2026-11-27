// Registro de funções de parada para processos de background (ex.: worker do gateway, F04).
const stoppers: Array<() => void | Promise<void>> = [];

export function onShutdown(fn: () => void | Promise<void>): void {
  stoppers.push(fn);
}

export async function runShutdown(): Promise<void> {
  for (const stop of stoppers.splice(0)) await stop();
}
