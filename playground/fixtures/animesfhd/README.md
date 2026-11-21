# Fixtures do AnimesFHD

Respostas JSON públicas fornecidas pelo mantenedor do site, capturadas em 11/11/2026. Cópias integrais de busca, populares, série, episódio e filme; sem chaves ou sessão autenticada.

Os testes também constroem casos sintéticos de múltiplos áudios/temporadas, paginação, episódios fracionários, falhas HTTP e redirecionamentos a partir dessas respostas. Os IDs 9001/9002 e os destinos `cdn.example` são exclusivamente de teste.

Execute na raiz com Node.js >= 22.18 (no Node 24+ a flag é `--test-isolation=none`):

```sh
node --test --experimental-test-isolation=none playground/animesfhd.test.mjs
```

A VM executa a classe real após remover os tipos TypeScript. Apenas `fetch` e `$sleep` são simulados; não equivale a validar Goja ou reprodução no Seanime. O teste não depende de Bun, rede ou bibliotecas adicionais.

Validação real, com Bun e Seanime em execução:

```sh
./playground/run.sh animesfhd
./playground/run.sh animesfhd --dub
```
