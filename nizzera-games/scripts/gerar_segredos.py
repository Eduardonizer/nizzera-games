#!/usr/bin/env python3
"""Gera os segredos do painel admin para colar na Vercel (Settings > Environment Variables).

Uso:  python scripts/gerar_segredos.py

Mostra:
  SESSION_SECRET     assina a sessão do painel
  ADMIN_TOTP_SECRET  ativa o código de 6 dígitos (2FA). Cadastre no Google Authenticator,
                     Microsoft Authenticator ou Authy: "Adicionar conta" > "Inserir chave".
Nada é salvo em arquivo nem enviado para lugar nenhum.
"""
import base64, secrets, urllib.parse

sessao = secrets.token_urlsafe(48)
totp = base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")
uri = "otpauth://totp/" + urllib.parse.quote("Nizzera Games:admin") + "?" + urllib.parse.urlencode(
    {"secret": totp, "issuer": "Nizzera Games", "digits": 6, "period": 30, "algorithm": "SHA1"})

print("SESSION_SECRET =", sessao)
print("ADMIN_TOTP_SECRET =", totp)
print()
print("No app autenticador, use a chave acima (tipo: baseada em tempo).")
print("Ou gere um QR code com este endereço, num gerador offline:")
print(uri)
