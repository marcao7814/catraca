import { EMAIL_RE, normalizeEmail } from '../auth/users.js';

/** Cartão digitado no formulário: espaços são removidos; a validação de 16 dígitos fica no motor de vendas. */
export function normalizeCardNumber(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
}

export const MIN_PASSWORD = 6;

export interface SignupValues {
  name: string;
  email: string;
}

export type SignupParse =
  | { ok: true; input: { name: string; email: string; password: string }; values: SignupValues }
  | { ok: false; error: string; values: SignupValues };

export function validateSignup(body: Record<string, unknown>): SignupParse {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const name = str(body.name).trim();
  const email = normalizeEmail(str(body.email));
  const password = str(body.password);
  const values = { name, email };
  if (!name) return { ok: false, error: 'Informe o nome.', values };
  if (name.length > 200) return { ok: false, error: 'Nome muito longo.', values };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'E-mail inválido.', values };
  if (password.length < MIN_PASSWORD)
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`, values };
  if (password.length > 200) return { ok: false, error: 'Senha muito longa.', values };
  return { ok: true, input: { name, email, password }, values };
}
