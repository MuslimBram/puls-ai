// supabase/functions/integration-wizard/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));if(!user) return json({error:"Unauthorized"},401);
  let body:{workspace_id?:string}={};if(req.method==="POST"){try{body=await req.json();}catch{}}
  const wsId=body.workspace_id??user.id;
  const{data:sub}=await sb.from("subscriptions").select("plan").eq("user_id",user.id).eq("status","active").maybeSingle();
  const plan=sub?.plan??"free";
  const[ig,wa,fb,gSync,metaAds,mc]=await Promise.all([
    sb.from("channels").select("id,handle_or_url").eq("business_id",wsId).eq("platform","instagram").maybeSingle(),
    sb.from("channels").select("id").eq("business_id",wsId).eq("platform","whatsapp").maybeSingle(),
    sb.from("channels").select("id").eq("business_id",wsId).eq("platform","facebook").maybeSingle(),
    sb.from("google_sync_log").select("id").eq("workspace_id",wsId).eq("status","success").limit(1).maybeSingle(),
    sb.from("meta_ads_cache").select("id").eq("workspace_id",wsId).limit(1).maybeSingle(),
    sb.from("business_memory").select("id").eq("business_id",wsId).limit(1).maybeSingle(),
  ]);
  const checks={
    instagram:{name:"Instagram",required:true,plan_required:"starter",status:ig.data?"connected":"not_started",details:ig.data?.handle_or_url?`@${ig.data.handle_or_url}`:"OAuth 1 klikim",action_url:"/connected-accounts?connect=instagram"},
    whatsapp:{name:"WhatsApp Business",required:true,plan_required:"starter",status:wa.data?"connected":"not_started",action_url:"/connections?connect=whatsapp"},
    facebook:{name:"Facebook",required:false,plan_required:"starter",status:fb.data?"connected":"not_started",action_url:"/connected-accounts?connect=facebook"},
    google_workspace:{name:"Google Workspace",required:false,plan_required:"growth",status:gSync.data?"connected":"not_started",action_url:"/connections?connect=google"},
    meta_ads:{name:"Meta Ads",required:false,plan_required:"growth",status:metaAds.data?"connected":"not_started",action_url:"/connections?connect=meta_ads"},
    email:{name:"Email (Resend)",required:true,plan_required:"starter",status:Deno.env.get("RESEND_API_KEY")?"connected":"not_started",action_url:"/connections?connect=email"},
    ai_memory:{name:"AI Memory (Skanim)",required:true,plan_required:"starter",status:mc.data?"connected":"not_started",action_url:"/sources?action=scan"},
  };
  const vals=Object.values(checks);
  const connected=vals.filter((c:Record<string,unknown>)=>c.status==="connected").length;
  const required_missing=vals.filter((c:Record<string,unknown>)=>c.required&&c.status!=="connected").map((c:Record<string,unknown>)=>c.name);
  await sb.from("integration_status").upsert({workspace_id:wsId,integrations:checks,last_checked:new Date().toISOString(),onboarding_done:required_missing.length===0,updated_at:new Date().toISOString()},{onConflict:"workspace_id"}).catch(()=>{});
  return json({success:true,plan,completion_pct:Math.round(connected/vals.length*100),connected,total:vals.length,required_missing,integrations:checks,onboarding_complete:required_missing.length===0});
});
