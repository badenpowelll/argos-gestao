import {useState} from 'react';
import {Button, Card, Heading, Input, Text} from '../ds';
import {useAuth} from '../auth';
import {ErrorNote} from '../ui';

export function LoginPage() {
  const {login, setup, needsSetup, setupCodeRequired} = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsSetup) await setup(name, email, password, code);
      else await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card" aria-labelledby="auth-title">
        <img className="logo" src="/argos-logo.png" alt="Argos Soluções" />
        <Heading level={1} size="md" id="auth-title">{needsSetup ? 'Primeiro acesso' : 'Entrar'}</Heading>
        {needsSetup && <Text muted size="sm">Crie o usuário administrador. Esta tela só aparece enquanto não houver nenhum usuário.</Text>}
        <form onSubmit={submit} className="dialog-body" noValidate>
          {needsSetup && setupCodeRequired && <Input label="Código de primeiro acesso" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" hint="Fornecido pela Argos na publicação do sistema." />}
          {needsSetup && <Input label="Nome" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <Input
            label="Senha" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsSetup ? 'new-password' : 'current-password'} hint={needsSetup ? 'Mínimo de 10 caracteres, com letras e números.' : undefined}
          />
          <ErrorNote error={error} />
          <Button type="submit" loading={busy}>{needsSetup ? 'Criar administrador' : 'Entrar'}</Button>
        </form>
        <p className="auth-tag">Onde dados se tornam decisão.</p>
      </Card>
    </div>
  );
}
