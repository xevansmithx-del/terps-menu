/* ============================================================
   TERPS order store — shared by consumer checkout + budtender dashboard
   DEMO mode (default): localStorage, single-device, fully clickable.
   LIVE mode: set ORDERS_CFG.backendUrl to the Google Apps Script web-app
   URL → orders POST/GET there and customers get text+email updates.
   ============================================================ */
const ORDERS_CFG = { backendUrl: "" };   // <-- paste Apps Script /exec URL here to go live
const STATUS_FLOW = ["new","preparing","ready","completed"];
const STATUS_LABEL = {new:"New",preparing:"Preparing",ready:"Ready for pickup",completed:"Completed",canceled:"Canceled"};
const STATUS_COLOR = {new:"#ee4b3b",preparing:"#e8b54b",ready:"#3e9b96",completed:"#1a5c45",canceled:"#6b776f"};

const Orders = {
  key:"terps_orders_v1", seqKey:"terps_order_seq",
  _local(){ try{return JSON.parse(localStorage.getItem(this.key))||[]}catch(e){return[]} },
  _save(a){ localStorage.setItem(this.key, JSON.stringify(a)); },
  _nextId(){ let n=parseInt(localStorage.getItem(this.seqKey)||"1041",10)+1; localStorage.setItem(this.seqKey,n); return "TD-"+n; },

  async list(){
    if(ORDERS_CFG.backendUrl){
      try{ const r=await fetch(ORDERS_CFG.backendUrl+"?action=list"); const d=await r.json(); return d.orders||[]; }catch(e){ return this._local(); }
    }
    return this._local().sort((a,b)=>b.createdAt-a.createdAt);
  },
  async create(order){
    order.id = order.id || this._nextId();
    order.createdAt = Date.now();
    order.status = "new";
    order.statusHistory = [{status:"new", at:Date.now()}];
    if(ORDERS_CFG.backendUrl){
      try{ const r=await fetch(ORDERS_CFG.backendUrl,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"create",order})}); const d=await r.json(); return d.order||order; }catch(e){}
    }
    const a=this._local(); a.push(order); this._save(a); return order;
  },
  async setStatus(id,status){
    if(ORDERS_CFG.backendUrl){
      try{ await fetch(ORDERS_CFG.backendUrl,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"setStatus",id,status})}); }catch(e){}
    }
    const a=this._local(); const o=a.find(x=>x.id===id);
    if(o){ o.status=status; (o.statusHistory=o.statusHistory||[]).push({status,at:Date.now()}); this._save(a); }
    return o;
  }
};

// One-time demo seed so the dashboard looks alive before real orders arrive
function seedDemoOrders(){
  if(ORDERS_CFG.backendUrl) return;
  if(localStorage.getItem("terps_orders_seeded")) return;
  const now=Date.now(), m=60000;
  const seed=[
    {id:"TD-1042",createdAt:now-4*m,status:"new",customer:{name:"Marcus Ryan",phone:"719-555-0142",email:"marcusr@example.com"},pickupTime:"ASAP",items:[{name:"Denver Dab Wax 1g",strain:"StarDawg",price:7,qty:2},{name:"1G Cart",strain:"Blackberry Gelato",price:12,qty:1}]},
    {id:"TD-1041",createdAt:now-11*m,status:"preparing",customer:{name:"Alexis Brand",phone:"719-555-0177",email:"alexisb@example.com"},pickupTime:"5:30 PM",items:[{name:"Grape Fritter",strain:"",price:3.71,qty:7}]},
    {id:"TD-1040",createdAt:now-19*m,status:"ready",customer:{name:"Devin Cole",phone:"719-555-0193",email:"devinc@example.com"},pickupTime:"ASAP",items:[{name:"Oil Twist Tanker",strain:"Melon Baller",price:35,qty:1},{name:"RIPT Blazed Blue Razz",strain:"",price:8.07,qty:2}]},
    {id:"TD-1039",createdAt:now-52*m,status:"completed",customer:{name:"Sam Ortiz",phone:"719-555-0128",email:"samo@example.com"},pickupTime:"picked up",items:[{name:"Tropicana Cookies",strain:"",price:2.42,qty:14}]}
  ];
  seed.forEach(o=>{o.subtotal=o.items.reduce((s,i)=>s+i.price*i.qty,0); o.statusHistory=[{status:o.status,at:o.createdAt}];});
  localStorage.setItem(Orders.key, JSON.stringify(seed));
  localStorage.setItem("terps_order_seq","1042");
  localStorage.setItem("terps_orders_seeded","1");
}
