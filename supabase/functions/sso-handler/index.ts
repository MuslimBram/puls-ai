// supabase/functions/sso-handler/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, GET, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const url=new URL(req.url);
  const action=url.searchParams.get("action")??"status";
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  if(req.method==="GET"&&action==="config"){
    const auth=req.headers.get("Authorization");if(!auth) return json({error:"Unauthorized"},401);
    const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));if(!user) return json({error:"Unauthorized"},401);
    const wsId=url.searchParams.get("workspace_id")??user.id;
    const{data:cfg}=await sb.from("sso_configs").select("provider,allowed_domains,is_active,enforce_sso,issuer_url,created_at").eq("workspace_id",wsId).maybeSingle();
    return json({configured:!!cfg,config:cfg??null,available_providers:["google","microsoft","okta","azure_ad"],setup_guide:{google:"Google Admin → Security → SSO → OAuth credentials",microsoft:"Azure Portal → App Registrations → OAuth 2.0",okta:"Okta Admin → Applications → OIDC"}});
  }
  if(req.method==="POST"&&action==="configure"){
    const auth=req.headers.get("Authorization");if(!auth) return json({error:"Unauthorized"},401);
    const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));if(!user) return json({error:"Unauthorized"},401);
    let body:{workspace_id?:string;provider:string;client_id:string;client_secret:string;tenant_id?:string;allowed_domains:string[];enforce_sso?:boolean};
    try{body=await req.json();}catch{return json({error:"Body invalid"},400);}
    const{data:s}=await sb.from("subscriptions").select("plan").eq("user_id",user.id).maybeSingle();
    if(!["enterprise","ultimate"].includes(s?.plan??"")) return json({error:"SSO requires the Enterprise or Ultimate plan",upgrade_url:"/subscription"},403);
    const wsId=body.workspace_id??user.id;
    const{error}=await sb.from("sso_configs").upsert({workspace_id:wsId,provider:body.provider,client_id:body.client_id,client_secret_encrypted:body.client_secret,tenant_id:body.tenant_id??null,allowed_domains:body.allowed_domains,is_active:true,enforce_sso:body.enforce_sso??false,updated_at:new Date().toISOString()},{onConflict:"workspace_id"});
    if(error) return json({error:error.message},500);
    await sb.rpc("log_audit",{p_workspace_id:wsId,p_user_id:user.id,p_action:"sso_configured",p_resource_type:"sso_config",p_severity:"warning",p_new_values:{provider:body.provider,domains:body.allowed_domains}}).catch(()=>{});
    return json({success:true,provider:body.provider,allowed_domains:body.allowed_domains});
  }
  if(req.method==="GET"&&action==="callback"){
    const state=url.searchParams.get("state")??"";
    const[wsId,provider]=state.split(":");
    await sb.rpc("log_audit",{p_workspace_id:wsId??null,p_user_id:null,p_action:"sso_callback",p_resource_type:"auth",p_severity:"info",p_new_values:{provider,state}}).catch(()=>{});
    return Response.redirect(`${Deno.env.get("DASHBOARD_URL")??"https://kohablerjeve.top"}/dashboard?sso_success=true`);
  }
  return json({actions:["config (GET)","configure (POST)","callback (GET)"]},400);
});
