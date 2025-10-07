### www.wllnr.nl

Source code for my website

## Development

Install dependencies 
```
npm install
```

Start dev server
```
npm run serve
```

## Deploy

```
npm run build

npm run firebase-token 
export FIREBASE_TOKEN="<token>"

npm run firebase-deploy -- --project wllnr-nl --token "$FIREBASE_TOKEN"
```
