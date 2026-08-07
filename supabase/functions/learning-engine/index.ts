// supabase/functions/learning-engine/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";

const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});

async function extractKnowledge(text:string):Promise<Array<{entity_type:string;key:string;value:Record<string,unknown>;confidence:number}>>{
  try{
    const r=await askAI(
      "Nxjerr njohuri te strukturuara nga teksti i biznesit. Kthe VETEM JSON array: [{entity_type:'product|faq_answer|business_hour|policy',key:string,value:{},confidence:0.0-1.0}]. Nese nuk ka, kthe [].",
      text.slice(0,2000),600
    );
    const p=JSON.parse(r.replace(/```json|```/g,"").trim());
    return Array.isArray(p)?p:[];
  }catch{return[];}
}

serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");
  if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));
  if(!user) return json({error:"Unauthorized"},401);
  let body:{source:string;workspace_id?:string;document_text?:string;document_name?:string;original_reply?:string;correction?:string;context?:string;url?:string};
  try{body=await req.json();}catch{return json({error:"Body invalid"},400);}
  const wsId=body.workspace_id??user.id;
  let learned=0;

  if(body.source==="staff_correction"&&body.original_reply&&body.correction){
    const lesson=await askAI(
      "Analize korrigjimin e stafit ndaj AI. Kthe JSON: {lesson:string,entity_type:string,confidence:number}",
      `AI tha:"${body.original_reply.slice(0,300)}"\nStafi korrigjoi:"${body.correction.slice(0,300)}"\nKontekst:"${(body.context??"").slice(0,100)}"`,150
    ).catch(()=>"{}");
    try{
      const p=JSON.parse(lesson.replace(/```json|```/g,"").trim());
      const{error}=await sb.from("business_memory").insert({
        business_id:wsId,entity_type:p.entity_type??"staff_correction",
        memory_key:`correction_${Date.now()}`,
        memory_value:{original:body.original_reply.slice(0,200),correction:body.correction.slice(0,200),lesson:p.lesson},
        confidence:0.97,source:"staff_correction"
      });
      if(!error){
        learned=1;
        // Shto edhe te ai_feedback per historik
        await sb.from("ai_feedback").insert({
          workspace_id:wsId,original_reply:body.original_reply,corrected_reply:body.correction,
          feedback_type:"correction",applied:true,applied_at:new Date().toISOString()
        }).catch(()=>{});
      }
    }catch{}

  }else if(body.source==="approval"&&body.original_reply){
    await sb.from("ai_feedback").insert({
      workspace_id:wsId,original_reply:body.original_reply,corrected_reply:body.original_reply,
      feedback_type:"approval",applied:true,applied_at:new Date().toISOString()
    }).catch(()=>{});
    // Rrit confidence te memories perkatese
    await sb.rpc("boost_memory_confidence",{p_business_id:wsId,p_text_match:body.original_reply.slice(0,50)}).catch(()=>{});
    learned=1;

  }else if(body.source==="document"&&body.document_text){
    const items=await extractKnowledge(body.document_text);
    for(const item of items){
      const{error}=await sb.from("business_memory").upsert({
        business_id:wsId,entity_type:item.entity_type,memory_key:item.key,
        memory_value:{...item.value,source_doc:body.document_name??"doc"},
        confidence:item.confidence,source:"document_learning"
      },{onConflict:"business_id,entity_type,memory_key"});
      if(!error)learned++;
    }

  }else if(body.source==="website"&&body.url){
    try{
      const res=await fetch(body.url,{headers:{"User-Agent":"PulseAI-Bot/1.0"}});
      const html=await res.text();
      const text=html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,3000);
      const items=await extractKnowledge(text);
      for(const item of items){
        const{error}=await sb.from("business_memory").upsert({
          business_id:wsId,entity_type:item.entity_type,memory_key:item.key,
          memory_value:{...item.value,source_url:body.url},
          confidence:item.confidence*0.85,source:"website_scan"
        },{onConflict:"business_id,entity_type,memory_key"});
        if(!error)learned++;
      }
    }catch{}

  }else if(body.source==="odoo"){
    const r=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/odoo-sync?action=sync_contacts`,{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`},
      body:JSON.stringify({workspace_id:wsId})
    });
    learned=r.ok?1:0;
  }

  await sb.rpc("log_audit",{p_workspace_id:wsId,p_user_id:user.id,p_action:`learn_from_${body.source}`,p_resource_type:"business_memory",p_severity:"info",p_new_values:{learned_items:learned,source:body.source}}).catch(()=>{});
  return json({success:true,source:body.source,items_learned:learned,message:`AI mesoi ${learned} njohuri nga ${body.source}`});
});
