const express=require('express'),Database=require('better-sqlite3'),multer=require('multer'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const DATA=process.env.DATA_DIR||'./data',SECRET=process.env.SESSION_SECRET||'dev-secret',BASE=process.env.BASE_URL||'http://localhost:3000';
fs.mkdirSync(DATA+'/videos',{recursive:true});
const db=new Database(DATA+'/app.db');
db.exec(`create table if not exists users(id integer primary key,email text unique,name text,salt text,hash text,role text default 'user');
create table if not exists courses(id integer primary key,title text,descr text,price integer,currency text default 'eur');
create table if not exists lessons(id integer primary key,course_id integer,module text,title text,file text,pos integer default 0);
create table if not exists purchases(id integer primary key,user_id integer,course_id integer,provider text,ref text,status text default 'pending',unique(user_id,course_id))`);
const CURRICULUM=[["1. Les bases du dropshipping", ["Qu’est-ce que le dropshipping ?", "Modèle économique, marges et budget de départ", "Les outils indispensables"]], ["2. Création de la boutique", ["Choisir sa plateforme (Shopify, WooCommerce…)", "Design, pages essentielles et fiche produit", "Moyens de paiement et livraison", "Mentions légales et confiance client"]], ["3. Recherche de produits", ["Les critères d’un produit gagnant", "Outils et méthodes de recherche", "Analyser la concurrence"]], ["4. Fournisseurs", ["Trouver et comparer des fournisseurs", "Commander des échantillons et tester", "Délais, retours et service client"]], ["5. Marchés à cibler", ["Choisir son pays et sa niche", "Analyser son audience et ses clients idéaux", "Spécificités locales : paiement à la livraison, logistique"]], ["6. Publicité", ["Les bases de la publicité Facebook & Instagram", "Publicité TikTok", "Créer des visuels et vidéos qui vendent", "Tester, mesurer et optimiser (ROAS)", "Passer à l’échelle"]], ["7. Gestion et croissance", ["Service client et suivi des commandes", "Analyser ses chiffres", "Automatiser et déléguer"]]];
if(!db.prepare('select count(*) n from courses').get().n){const cid=db.prepare('insert into courses(title,descr,price,currency) values(?,?,?,?)').run('Formation Dropshipping & E-commerce complète','De la création de la boutique à la croissance, publicité Facebook & TikTok incluse.',15000,'xof').lastInsertRowid;
  const ins=db.prepare('insert into lessons(course_id,module,title,pos) values(?,?,?,?)');let p=0;for(const[m,ts]of CURRICULUM)for(const t of ts)ins.run(cid,m,t,++p)}
const sign=v=>v+'.'+crypto.createHmac('sha256',SECRET).update(v).digest('hex');
const unsign=s=>{if(!s)return;const v=s.slice(0,s.lastIndexOf('.'));return sign(v)===s?v:undefined};
const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
const JEKO='https://api.jeko.africa/partner_api';
db.exec(`create table if not exists payments(reference text primary key,user_id integer,course_id integer,status text default 'pending')`);
// Point d'extension : tout moyen de paiement (Stripe, Mobile Money...) appelle markPaid quand le paiement est confirmé
const markPaid=(userId,courseId,provider,ref)=>db.prepare(`insert into purchases(user_id,course_id,provider,ref,status) values(?,?,?,?,'paid')
 on conflict(user_id,course_id) do update set status='paid',provider=excluded.provider,ref=excluded.ref`).run(userId,courseId,provider,ref);
const owns=(u,cid)=>u&&(u.role==='admin'||db.prepare(`select 1 from purchases where user_id=? and course_id=? and status='paid'`).get(u.id,cid));
const app=express();
app.post('/webhook/jeko',express.raw({type:'*/*'}),(req,res)=>{ // Jèko : HMAC-SHA256 du corps brut (hex) dans Jeko-Signature
  const sec=process.env.JEKO_WEBHOOK_SECRET||'',sig=String(req.headers['jeko-signature']||''),exp=crypto.createHmac('sha256',sec).update(req.body).digest('hex');
  if(!sec||sig.length!==exp.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))return res.sendStatus(401);
  try{const b=JSON.parse(req.body.toString());
    if(req.headers['jeko-event']==='TRANSACTION_COMPLETED'&&b.transactionType==='payment'&&b.status==='success'){
      const p=db.prepare('select * from payments where reference=?').get(b.transactionDetails&&b.transactionDetails.reference);
      if(p){markPaid(p.user_id,p.course_id,'jeko',b.id);db.prepare("update payments set status='paid' where reference=?").run(p.reference)}}}catch(e){}
  res.sendStatus(200)});
app.use(express.json());
app.use((req,res,next)=>{const c=(req.headers.cookie||'').split('; ').find(x=>x.startsWith('sid='));
  const id=c&&unsign(decodeURIComponent(c.slice(4)));req.user=id?db.prepare('select id,email,name,role from users where id=?').get(+id):null;next()});
const need=(req,res,next)=>req.user?next():res.status(401).json({error:'Connexion requise'});
const adm=(req,res,next)=>req.user&&req.user.role==='admin'?next():res.status(403).json({error:'Réservé à l’administrateur'});
const login=(res,id)=>res.setHeader('Set-Cookie',`sid=${encodeURIComponent(sign(String(id)))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${BASE.startsWith('https')?'; Secure':''}`);
app.post('/api/register',(req,res)=>{const{email,name,password}=req.body||{};
  if(!email||!password||password.length<8)return res.status(400).json({error:'Email et mot de passe (8 caractères min.) requis'});
  const salt=crypto.randomBytes(16).toString('hex'),role=email.toLowerCase()===(process.env.ADMIN_EMAIL||'').toLowerCase()?'admin':'user';
  try{const r=db.prepare('insert into users(email,name,salt,hash,role) values(?,?,?,?,?)').run(email.toLowerCase(),name||'',salt,hash(password,salt),role);login(res,r.lastInsertRowid);res.json({ok:1})}
  catch(e){res.status(409).json({error:'Cet email existe déjà'})}});
app.post('/api/login',(req,res)=>{const{email,password}=req.body||{},u=db.prepare('select * from users where email=?').get((email||'').toLowerCase());
  if(!u||hash(password||'',u.salt)!==u.hash)return res.status(401).json({error:'Identifiants incorrects'});login(res,u.id);res.json({ok:1})});
app.post('/api/logout',(req,res)=>{res.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');res.json({ok:1})});
app.get('/api/me',(req,res)=>res.json({user:req.user}));
app.get('/api/courses',(req,res)=>res.json(db.prepare('select * from courses order by id').all().map(c=>({...c,lessons:db.prepare('select count(*) n from lessons where course_id=? and file is not null').get(c.id).n,owned:!!owns(req.user,c.id)}))));
app.get('/api/courses/:id',(req,res)=>{const c=db.prepare('select * from courses where id=?').get(+req.params.id);if(!c)return res.sendStatus(404);
  res.json({course:c,owned:!!owns(req.user,c.id),lessons:db.prepare('select id,module,title,(file is not null) has from lessons where course_id=? order by pos,id').all(c.id)})});
app.get('/video/:id',need,(req,res)=>{const l=db.prepare('select * from lessons where id=?').get(+req.params.id);
  if(!l||!l.file||!owns(req.user,l.course_id))return res.status(403).send('Accès refusé : achetez la formation.');
  res.sendFile(path.resolve(DATA,'videos',l.file))}); // Range géré par Express : lecture/avance rapide OK
app.post('/api/checkout',need,async(req,res)=>{const c=db.prepare('select * from courses where id=?').get(+req.body.courseId);if(!c)return res.sendStatus(404);
  const m=req.body.method;if(!['wave','orange','mtn','moov','djamo'].includes(m))return res.status(400).json({error:'Moyen de paiement invalide'});
  if(c.currency!=='xof')return res.status(400).json({error:'La formation doit être en FCFA'});
  const{JEKO_API_KEY:k,JEKO_API_KEY_ID:kid,JEKO_STORE_ID:sid}=process.env;if(!k||!kid||!sid)return res.status(503).json({error:'Paiement non configuré'});
  const ref=crypto.randomUUID();db.prepare('insert into payments(reference,user_id,course_id) values(?,?,?)').run(ref,req.user.id,c.id);
  try{const r=await fetch(JEKO+'/payment_requests',{method:'POST',headers:{'X-API-KEY':k,'X-API-KEY-ID':kid,'Content-Type':'application/json'},
      body:JSON.stringify({storeId:sid,amountCents:c.price*100,currency:'XOF',reference:ref,paymentDetails:{type:'redirect',data:{paymentMethod:m,successUrl:BASE+'/?paid=1',errorUrl:BASE+'/?paid=0'}}})});
    const j=await r.json();if(!r.ok||!j.redirectUrl)return res.status(502).json({error:'Jèko a refusé la demande de paiement'});res.json({url:j.redirectUrl})}
  catch(e){res.status(502).json({error:'Jèko injoignable'})}});
const up=multer({storage:multer.diskStorage({destination:DATA+'/videos',filename:(r,f,cb)=>cb(null,crypto.randomUUID()+path.extname(f.originalname))}),limits:{fileSize:4e9}});
app.post('/api/admin/courses',adm,(req,res)=>{const{title,descr,price,currency}=req.body;
  res.json({id:db.prepare('insert into courses(title,descr,price,currency) values(?,?,?,?)').run(title,descr||'',currency==='xof'||!currency?Math.round(+price):Math.round(+price*100),currency||'xof').lastInsertRowid})});
app.post('/api/admin/lessons',adm,up.single('video'),(req,res)=>{if(!req.file)return res.status(400).json({error:'Vidéo manquante'});
  db.prepare('insert into lessons(course_id,module,title,file,pos) values(?,?,?,?,?)').run(+req.body.courseId,req.body.module||'',req.body.title,req.file.filename,+req.body.pos||0);res.json({ok:1})});
app.post('/api/admin/lessons/:id/video',adm,up.single('video'),(req,res)=>{const l=db.prepare('select * from lessons where id=?').get(+req.params.id);
  if(!l||!req.file)return res.status(400).json({error:'Leçon ou vidéo manquante'});if(l.file)fs.rmSync(path.join(DATA,'videos',l.file),{force:true});
  db.prepare('update lessons set file=? where id=?').run(req.file.filename,l.id);res.json({ok:1})});
app.delete('/api/admin/lessons/:id',adm,(req,res)=>{const l=db.prepare('select * from lessons where id=?').get(+req.params.id);
  if(l){if(l.file)fs.rmSync(path.join(DATA,'videos',l.file),{force:true});db.prepare('delete from lessons where id=?').run(l.id)}res.json({ok:1})});
app.delete('/api/admin/courses/:id',adm,(req,res)=>{db.prepare('select * from lessons where course_id=?').all(+req.params.id).forEach(l=>l.file&&fs.rmSync(path.join(DATA,'videos',l.file),{force:true}));
  db.prepare('delete from lessons where course_id=?').run(+req.params.id);db.prepare('delete from courses where id=?').run(+req.params.id);res.json({ok:1})});
app.use(express.static('public'));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('OK'));
