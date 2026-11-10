#!/bin/zsh
cd -- "${0:A:h}" || exit 1
echo 'Открой http://127.0.0.1:4048 после сообщения о запуске. Для остановки нажми Ctrl+C.'
exec node tools/server.mjs
