// CLI de vendas para avaliação e testes manuais, chamando o motor de vendas (F04) diretamente.
// Útil enquanto um canal (vitrine F03, API F05) ainda não existe na branch avaliada.
//
//   docker compose exec -T app node dist/tools/sales-cli.js buy <eventId> <cartão> [email]
//   docker compose exec -T app node dist/tools/sales-cli.js ticket <ticketId>
//
// Saída: uma linha JSON. Código de saída 0 em sucesso, 1 em erro de negócio, 2 em uso inválido.
import { closePool } from '../db/pool.js';
import { getTicket, purchaseTicket } from '../modules/sales/index.js';

const [cmd, ...args] = process.argv.slice(2);
let code = 0;

try {
  if (cmd === 'buy' && args.length >= 2) {
    const [eventId, cardNumber, buyerEmail = 'cli@example.com'] = args as [string, string, string?];
    const res = await purchaseTicket({ eventId, channel: 'partner', buyerEmail, cardNumber });
    if (res.ok) {
      console.log(JSON.stringify({ ticketId: res.ticket.id, code: res.ticket.code, status: res.ticket.status }));
    } else {
      console.log(JSON.stringify({ error: res.error }));
      code = 1;
    }
  } else if (cmd === 'ticket' && args.length === 1) {
    const t = await getTicket(args[0]!);
    if (t) {
      console.log(
        JSON.stringify({
          ticketId: t.id,
          code: t.code,
          eventId: t.eventId,
          status: t.status,
          checkedIn: t.checkedInAt !== null,
        }),
      );
    } else {
      console.log(JSON.stringify({ error: 'ticket_not_found' }));
      code = 1;
    }
  } else {
    console.error('uso: sales-cli.js buy <eventId> <cartão> [email] | ticket <ticketId>');
    code = 2;
  }
} finally {
  await closePool();
}
process.exit(code);
