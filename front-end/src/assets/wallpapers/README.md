## Wallpaper Global (Psicólogo)

Arquivo utilizado globalmente no fundo absoluto dos painéis:

- `psychologist-wallpaper.jpeg`
- `psychologist-wallpaper.jpg`
- `psychologist-wallpaper.png`

Como trocar:

1. Substitua **apenas um** dos arquivos acima pela sua imagem (mesmo nome e extensão).
2. Reinicie o Expo (`npm run start -- --clear`) para limpar cache de asset.

Recomendação:

- Formatos aceitos: JPEG, JPG e PNG
- Resolução sugerida: 1290x2796 (ou superior, proporção vertical)
- Evite áreas muito claras no rodapé para manter contraste dos ícones da barra inferior.

Observação técnica:

- O app tenta carregar na ordem: `.jpeg` -> `.jpg` -> `.png`.
- Arquivos placeholder 1x1 ficam no repositório para evitar erro de resolução do Metro quando um formato não for usado.
