# Fluxo de Plano

O fluxo de plano é uma forma estruturada de trabalhar com agentes de IA: gerar um plano, revisar com comentários, e só então executar.

## Fases

O plano passa por quatro fases:

```
idle → planning → reviewing → executing
```

### idle
Estado inicial. Nenhum plano ativo na sessão.

### planning
O agente está gerando o plano. O documento é escrito em tempo real e exibido no Arandu via live reload.

### reviewing
O plano foi gerado. Você pode:
- Ler o documento no painel de visualização
- Adicionar comentários em blocos específicos (`Cmd/Ctrl+Clique`)
- Ver o prompt de revisão consolidado
- Aprovar ou solicitar revisões

### executing
O plano foi aprovado. O agente está executando as mudanças.

## Arquivo de plano

O plano é salvo como arquivo Markdown em:
```
~/.local/share/arandu/plans/{session_id}.md
```

Você pode abrir este arquivo diretamente no Arandu para revisão detalhada.

## Comentários no plano

Durante a fase **reviewing**, use `Cmd/Ctrl+Clique` em qualquer bloco do plano para adicionar um comentário. Os comentários são agregados em um prompt de revisão que pode ser enviado de volta ao agente.

## Aprovando e executando

Após revisar:
1. Clique em **Aprovar Plano** para avançar para a fase `executing`
2. O agente recebe o sinal de aprovação e começa a execução
3. Acompanhe o progresso na sessão

## Rejeitando e revisando

Se o plano precisar de melhorias:
1. Adicione comentários nos blocos problemáticos
2. Clique em **Solicitar Revisão** para enviar o prompt de revisão ao agente
3. O agente gera uma versão revisada
4. O fluxo volta para a fase `reviewing`
