// supabase/functions/ai-setup-assistant/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const STEPS=[{id:1,title:"Business Profile",action:"complete_profile",url:"/business-profile"},{id:2,title:"Connect Instagram",action:"connect_instagram",url:"/connected-accounts?connect=instagram"},{id:3,title:"Connect WhatsApp",action:"connect_whatsapp",url:"/connections?connect=whatsapp"},{id:4,title:"AI Scan",action:"run_scan",url:"/sources?action=scan"},{id:5,title:"Test AI Reply",action:"test_ai",url:"/inbox"},{id:6,title:"Configure Channels",action:"configure_channels",url:"/channels"}];
const COSTS:{[k:string]:number}={starter:99,growth:149,pro:249,agency:349,enterprise:799,ultimate:999};
serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,getServiceKey()!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));if(!user) return json({error:"Unauthorized"},401);
  let body:{workspace_id?:string}={};try{body=await req.json();}catch{/* ignore empty body */}
  const wsId=body.workspace_id??user.id;
  const[intStatus,agentCfg,memCount,sub]=await Promise.all([
    sb.from("integration_status").select("*").eq("workspace_id",wsId).maybeSingle(),
    sb.from("ai_agent_configs").select("business_description").eq("workspace_id",wsId).maybeSingle(),
    sb.from("business_memory").select("*",{count:"exact",head:true}).eq("business_id",wsId),
    sb.from("subscriptions").select("plan").eq("user_id",user.id).maybeSingle(),
  ]);
  const plan=(sub.data?.plan??"starter") as string;
  const ints=(intStatus.data?.integrations??{}) as Record<string,{status:string}>;
  const mc=(memCount.count??0) as number;
  const completed=STEPS.filter(s=>{
    if(s.action==="complete_profile") return !!agentCfg.data?.business_description;
    if(s.action==="connect_instagram") return ints.instagram?.status==="connected";
    if(s.action==="connect_whatsapp") return ints.whatsapp?.status==="connected";
    if(s.action==="run_scan") return mc>5;
    if(s.action==="test_ai") return intStatus.data?.ai_setup_done;
    return false;
  });
  const current=STEPS.find(s=>!completed.find(c=>c.id===s.id))??STEPS[STEPS.length-1];
  const pct=Math.round(completed.length/STEPS.length*100);
  let guidance="";
  try{guidance=await askAI("You are the Pulse AI onboarding assistant. Give one concrete instruction (max 2 sentences), in English.",`Step: "${current.title}". Progress: ${pct}%.`,100);}
  catch{guidance=`Next step: ${current.title}. Click the button to continue.`;}
  const agents=[];
  if(ints.instagram?.status==="connected"||ints.whatsapp?.status==="connected"){
    agents.push({id:"sales_manager",name:"AI Sales Manager",reason:"Captures leads automatically from DMs"});
    agents.push({id:"marketing_manager",name:"AI Marketing Manager",reason:"Generates content and manages campaigns"});
  }
  if(mc>10) agents.push({id:"customer_success",name:"AI Customer Success",reason:"Reduces churn and increases retention"});
  if(["pro","enterprise","ultimate"].includes(plan)) agents.push({id:"ceo_assistant",name:"AI CEO Assistant",reason:"Daily KPI brief"});
  return json({success:true,workspace_id:wsId,plan,progress:{pct,completed_steps:completed.length,total_steps:STEPS.length,current_step:current,completed:completed.map(s=>s.id),is_complete:pct===100},ai_guidance:guidance,suggested_agents:agents,costs_transparency:{pulse_ai_monthly:COSTS[plan]??99,third_party_costs:{"Meta Ads":"depends on budget — paid directly to Meta","WhatsApp API":"$0.005/msg","Stripe":"2.9%+$0.30/tx","Twilio SMS":"$0.0079/SMS","Resend":"Free up to 3K/month"},note:"Third-party costs are paid DIRECTLY to those providers, not to Pulse AI."}});
});
