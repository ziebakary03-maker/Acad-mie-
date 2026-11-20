# Académie Dropshipping & E-commerce

Site + back-office + paiement Jèko (Wave, Orange Money, MTN, Moov, Djamo) + accès après achat. Node/Express + SQLite, vidéos sur un volume Fly.io.
Formation unique à 15 000 FCFA (modifiable dans /admin.html).

## Jèko : configuration
1. Dashboard Business Jèko → Paramètres → API & Webhooks : créez vos clés (X-API-KEY et X-API-KEY-ID).
2. Jèko n'a pas de sandbox : créez un **magasin dédié aux tests** et récupérez son `storeId` (GET /partner_api/stores).
3. Après déploiement, dans le même écran, créez le webhook du magasin : `https://VOTRE-APP.fly.dev/webhook/jeko` (HTTPS, une seule URL par magasin). Copiez le **secret webhook** tout de suite : il ne s'affiche qu'une fois.
4. Premier test : faites un vrai paiement de petit montant (modifiez temporairement le prix dans /admin.html), puis vérifiez que l'accès s'ouvre.
Frais Jèko Checkout : 1,5 % par transaction réussie.

## Test local
    npm install
    ADMIN_EMAIL=vous@mail.com JEKO_API_KEY=... JEKO_API_KEY_ID=... JEKO_STORE_ID=... JEKO_WEBHOOK_SECRET=... npm start
(Jèko ne peut pas appeler localhost : le webhook ne marchera qu'une fois déployé.)
Créez un compte avec l'email ADMIN_EMAIL : il devient admin → /admin.html

## Déploiement Fly.io
    fly launch --no-deploy
    fly volumes create data --size 20 --region cdg
    fly secrets set SESSION_SECRET=$(openssl rand -hex 32) ADMIN_EMAIL=vous@mail.com BASE_URL=https://VOTRE-APP.fly.dev \
      JEKO_API_KEY=... JEKO_API_KEY_ID=... JEKO_STORE_ID=... JEKO_WEBHOOK_SECRET=...
    fly deploy
