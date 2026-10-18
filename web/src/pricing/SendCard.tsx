import {useState} from 'react';
import {Alert, Badge, Button, Card, Input, Textarea, useToast} from '../ds';
import {api} from '../api';
import {dateTimeBR} from '../format';
import {ConfirmDialog, ErrorNote, useLoad} from '../ui';

interface Share {id: string; version: number; expires_at: string; revoked_at: string | null; views: number; last_viewed_at: string | null; created_at: string}

/** Envio da proposta emitida ao cliente por WhatsApp: link seguro do PDF + mensagem pronta + registro do envio. */
export function SendCard({id, version, number, onSent}: {id: string; version: number; number: string; onSent: () => void}) {
  const {toast} = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shares = useLoad(() => api.get<Share[]>(`/proposals/${id}/shares`), [id]);
  const wa = useLoad(() => api.get<{message: string; phone: string | null; link: string | null; client_has_number: boolean}>(
    `/proposals/${id}/whatsapp?version=${version}${url ? `&share_url=${encodeURIComponent(url)}` : ''}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`), [id, version, url, phone]);
  const text = msg ?? wa.data?.message ?? '';
  const link = wa.data?.phone ? `https://wa.me/${wa.data.phone}?text=${encodeURIComponent(text)}` : null;
  const canShareFile = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function';

  async function sharePdf() {
    try {
      const r = await fetch(`/api/proposals/${id}/pdf?version=${version}`, {credentials: 'same-origin'});
      const file = new File([await r.blob()], `Proposta-${number}.pdf`, {type: 'application/pdf'});
      if (!navigator.canShare({files: [file]})) { toast({title: 'Este aparelho não permite compartilhar o arquivo', description: 'Use o link seguro ou baixe o PDF e anexe no WhatsApp.', tone: 'warning'}); return; }
      await navigator.share({files: [file], text});
    } catch (e) { if ((e as Error).name !== 'AbortError') toast({title: 'Não foi possível compartilhar', description: (e as Error).message, tone: 'danger'}); }
  }

  return (
    <Card title="Enviar ao cliente pelo WhatsApp">
      <ol style={{margin: 0, paddingLeft: 18, display: 'grid', gap: 12}}>
        <li><strong>Link seguro do PDF.</strong> Quem tiver o link vê o PDF (sem login), até a validade da proposta; você pode revogar.
          <div className="dialog-actions" style={{justifyContent: 'flex-start', marginTop: 6}}>
            <Button onClick={() => setConfirm(true)}>{url ? 'Gerar novo link' : 'Gerar link seguro'}</Button>
            <a className="ads-btn ads-btn--outline" style={{textDecoration: 'none'}} href={`/api/proposals/${id}/pdf?version=${version}&download=1`}>Baixar PDF</a>
          </div>
          {url && <Alert tone="success" title="Link gerado">O link já está na mensagem abaixo (mostrado apenas agora).</Alert>}
        </li>
        <li><strong>Mensagem e número.</strong>
          <Input label="WhatsApp do cliente (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={wa.data?.phone ? `usando ${wa.data.phone}` : '(84) 99999-9999'} hint={wa.data && !wa.data.client_has_number ? 'Cliente sem WhatsApp cadastrado: informe o número.' : 'Deixe vazio para usar o cadastro do cliente.'} />
          <Textarea label="Mensagem (editável)" rows={9} value={text} onChange={(e) => setMsg(e.target.value)} />
        </li>
        <li><strong>Enviar.</strong>
          <div className="dialog-actions" style={{justifyContent: 'flex-start', marginTop: 6}}>
            {link ? <a className="ads-btn ads-btn--primary" style={{textDecoration: 'none'}} href={link} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a> : <Button disabled>Informe o número para abrir</Button>}
            {canShareFile && <Button variant="outline" onClick={() => void sharePdf()}>Compartilhar o PDF (celular)</Button>}
            <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(text).then(() => toast({title: 'Mensagem copiada'}))}>Copiar mensagem</Button>
            <Button variant="outline" onClick={async () => { try { await api.post(`/proposals/${id}/sent`, {message: text, channel: 'whatsapp', confirm: true}); toast({title: 'Envio registrado', description: 'Proposta marcada como enviada e contato gravado no cliente.', tone: 'success'}); onSent(); } catch (e) { setErr((e as Error).message); } }}>Registrar envio</Button>
          </div>
          <ErrorNote error={err} />
          <p className="muted" style={{fontSize: '.8rem'}}>O envio é feito por você no WhatsApp (o link abre a conversa com a mensagem pronta). O envio automático pela API oficial depende da conta WhatsApp Business e ainda não está ativo.</p>
        </li>
      </ol>
      {(shares.data ?? []).length > 0 && (
        <details><summary>Links gerados ({shares.data?.length})</summary>
          <ul className="list">{shares.data?.map((s) => (
            <li key={s.id}><span>v{s.version} · criado {dateTimeBR(s.created_at)} · expira {dateTimeBR(s.expires_at)} · {s.views} visualização(ões){s.last_viewed_at ? ` (última ${dateTimeBR(s.last_viewed_at)})` : ''}</span>
              {s.revoked_at ? <Badge tone="neutral">Revogado</Badge> : new Date(s.expires_at) < new Date() ? <Badge tone="warning">Expirado</Badge> : <Button size="sm" variant="outline" onClick={async () => { await api.post(`/proposals/${id}/shares/${s.id}/revoke`); shares.reload(); }}>Revogar</Button>}</li>))}</ul></details>)}
      <ConfirmDialog open={confirm} title="Gerar link seguro do PDF" confirmLabel="Gerar link" onClose={() => setConfirm(false)}
        onConfirm={async () => { const r = await api.post<{url: string}>(`/proposals/${id}/share`, {version, confirm: true}); setUrl(r.url); setMsg(null); setConfirm(false); shares.reload(); }}>
        <p>Será criado um endereço secreto e difícil de adivinhar para o PDF da proposta {number}. Qualquer pessoa com o endereço poderá abrir o PDF até a data de validade. Você pode revogá-lo a qualquer momento.</p>
      </ConfirmDialog>
    </Card>
  );
}
