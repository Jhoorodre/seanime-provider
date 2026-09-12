# Tomato Provider — Documentação de Uso

O Tomato **exige login** para funcionar. O app oficial autentica com e-mail/senha protegidos por captcha (hCaptcha), e isso não pode ser automatizado por este provider. Em vez disso, você mesmo faz login uma vez por fora e cola o **token de autenticação (Bearer)** já pronto nas configurações do provider no Seanime.

---

## Como obter o token

Escolha uma das opções abaixo — qualquer uma resulta no mesmo tipo de token (JWT Bearer):

### 1. Via extensão Tomato no Aniyomi/Mihon (mais simples)

Se você já usa a extensão Tomato original no Aniyomi/Mihon com sua conta logada, as próprias configurações da extensão têm um campo **"Token de Autenticação (Manual)"** que mostra o token da sessão ativa. Copie esse valor.

### 2. Interceptando o tráfego do app oficial

1. Instale um proxy de captura tipo [HTTP Toolkit](https://httptoolkit.com/) ou Reqable no computador/celular.
2. Faça login normalmente no app oficial da Tomato (resolvendo o captcha você mesmo).
3. Procure por uma requisição para `prod-api.tomatoanimes.com` ou `edge.betomato.com` e copie o valor do header `Authorization: Bearer <token>` (sem o prefixo "Bearer ").

---

## Configurando no Seanime

Cole o token copiado no campo **"Bearer Token"** nas configurações do provider Tomato.

> O token tem validade limitada (a sessão expira periodicamente, como em qualquer app). Quando parar de funcionar, repita os passos acima para gerar um novo.

---

## Observações e limitações conhecidas

- **Sem token configurado**, todos os métodos (`search`, `findEpisodes`, `findEpisodeServer`) lançam erro pedindo configuração — não há modo anônimo.
- **Bloqueio por IP**: o endpoint de streaming (`/v2/anime/episode/{id}/stream`) já demonstrou retornar erro 500 a partir de certas redes/IPs (bloqueio temporário do lado do servidor), enquanto funciona normalmente em outras (ex.: dados móveis). Isso não é um bug do provider — se `findEpisodeServer` falhar persistentemente, tente outra rede antes de reportar.
- **`search`**: o payload de busca omite o campo `tags` por completo quando não há filtro de gênero. Enviá-lo como `null` ou array vazio faz a API responder com sucesso, mas retornar sempre uma lista vazia (comportamento silencioso, sem erro).
- **Dublado/Legendado**: cada temporada pode ter uma versão dublada e uma legendada separadas (mesmo `season_number`, `season_dubbed` diferente). O provider lista cada episódio+idioma como uma entrada própria de `EpisodeDetails`, distinguidos pelo sufixo no título (ex.: "T1 - Ep 5 (Dublado)").
