# Workspace VectoFlow (reorganizado)

## Objetivo
Esta revisão reorganiza a camada de ferramentas para reduzir duplicação de lógica no `app.js`, mantendo a compatibilidade com os handlers existentes no HTML (`onclick`/`onchange`) e o fluxo atual do editor.

## Estrutura atual
- `index.html`: layout e wiring dos controles.
- `styles.css`: aparência do editor.
- `app.js`: motor do editor SVG.
- `WORKSPACE.md`: guia de organização e evolução técnica.

## Melhorias aplicadas nesta reescrita
1. **Camada de interação do canvas simplificada**
   - Extração de `beginPan` para unificar início de pan por espaço, botão do meio e Alt+arrastar.
   - Extração de `createContinuousShape` para criar ferramentas contínuas (polyline, polygon, star e path) com menos ramificações.

2. **Ferramentas contínuas corrigidas**
   - `polyline` agora cria elemento SVG `polyline` (antes era criado como `polygon`).
   - Regras de `fill` foram separadas por tipo:
     - `polyline` usa `fill='none'`.
     - `polygon/star` usam `fill` configurado.

3. **Fluxo de mouse mais previsível**
   - `cwDown`, `cwMove` e `cwUp` reorganizados para early-return claro por estado.
   - Mantida compatibilidade com estados globais e funções públicas utilizadas pela interface.

## Compatibilidade preservada
- Todas as ações acionadas pelo HTML continuam com os mesmos nomes globais.
- Sem mudança no markup dos controles.
- Sem quebra em serialização/import/export já existente.

## Próximo passo recomendado (opcional)
Evoluir para módulos (`core/viewport`, `tools/draw`, `tools/text`, `history`) em arquivos separados e usar um bootstrap único para expor apenas a API pública no `window`.
