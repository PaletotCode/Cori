# Commit Convention (Conventional Commits)

Formato:

```text
<type>(<scope opcional>): <descricao curta>
```

Tipos recomendados:

- `feat`: nova funcionalidade
- `fix`: correcao de bug
- `refactor`: melhoria sem alterar comportamento externo
- `test`: adicao/ajuste de testes
- `chore`: tarefas de manutencao
- `docs`: documentacao
- `ci`: alteracoes de pipeline

Exemplos:

- `feat(backend): adiciona endpoint de healthcheck`
- `fix(infra): corrige dependencias do worker no compose`
- `ci(monorepo): adiciona pipeline lint typecheck test build`
