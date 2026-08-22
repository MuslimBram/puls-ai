// supabase/functions/multi-agent-engine/index.ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { askAI } from "../_shared/ai-client.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const CORS={"Access-Control-Allow-Origin":Deno.env.get("ALLOWED_ORIGIN")??"","Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const AGENTS:{[k:string]:{name:string;taskType:string;prompt:string}}={
  sales_manager:{name:"AI Sales Manager",taskType:"sales",prompt:"Sales Manager AI. Analyzes the pipeline. JSON:{actions:[{priority:1,action:'',why:''}],deals_at_risk:[{contact:'',reason:''}]}"},
  marketing_manager:{name:"AI Marketing Manager",taskType:"marketing",prompt:"Marketing Manager AI. JSON:{weekly_plan:[{day:'',type:'',topic:'',hook:''}],recommendations:[]}"},
  customer_success:{name:"AI Customer Success",taskType:"customer_success",prompt:"CSM AI. JSON:{churn_risks:[{contact:'',risk_level:'high|medium',action:''}],upsell_opportunities:[],health_score:0}"},
  ceo_assistant:{name:"AI CEO Assistant",taskType:"ceo_assist",prompt:"CEO Assistant AI. JSON:{executive_summary:'',top_3_priorities:[{priority:1,action:'',impact:''}],risks:[],opportunities:[]}"},
  coach:{name:"AI Business Coach",taskType:"coaching",prompt:"Business Coach AI. JSON:{team_assessment:{strengths:[],gaps:[]},recommended_training:[{topic:'',reason:''}],weekly_challenge:''}"},
};
async function getCtx(sb:ReturnType<typeof createClient>,wsId:string):Promise<string>{
  const[leads,convs]=await Promise.all([
    sb.from("leads").select("*",{count:"exact",head:true}).eq("workspace_id",wsId),
    sb.from("conversation_threads").select("*",{count:"exact",head:true}).eq("workspace_id",wsId),
  ]);
  return `Leads:${leads.count??0} | Conversations:${convs.count??0}`;
}
serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  const auth=req.headers.get("Authorization");
  if(!auth) return json({error:"Unauthorized"},401);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,getServiceKey()!,{auth:{persistSession:false}});
  const{data:{user}}=await sb.auth.getUser(auth.replace("Bearer ",""));
  if(!user) return json({error:"Unauthorized"},401);
  let body:{agent:string;workspace_id?:string;input?:string;run_all?:boolean};
  try{body=await req.json();}catch{return json({error:"Body invalid"},400);}
  const wsId=body.workspace_id??user.id;
  const ctx=await getCtx(sb,wsId);
  const keys=body.run_all||body.agent==="all"?Object.keys(AGENTS):[body.agent];
  if(!body.run_all&&!AGENTS[body.agent]) return json({error:`Agent "${body.agent}" does not exist`,available:Object.keys(AGENTS)},400);
  const results:Record<string,unknown>={};
  await Promise.allSettled(keys.map(async k=>{
    const ag=AGENTS[k];if(!ag){results[k]={error:"not found"};return;}
    const{data:t}=await sb.from("ai_agent_tasks").insert({workspace_id:wsId,task_type:ag.taskType,agent_name:k,input:{ctx:ctx.slice(0,100),input:body.input??""},status:"running",started_at:new Date().toISOString()}).select("id").single();
    try{
      const r=await askAI(`${ag.prompt}
Context: ${ctx}`,body.input??"Analyze and recommend",500,{workspaceId:wsId,authHeader:auth,taskType:"complex_reasoning",userId:user.id});
      let out:Record<string,unknown>;try{out=JSON.parse(r.replace(/```json|```/g,"").trim());}catch{out={response:r};}
      await sb.from("ai_agent_tasks").update({output:out,status:"completed",completed_at:new Date().toISOString()}).eq("id",t?.id??"");
      results[k]=out;
    }catch(e){await sb.from("ai_agent_tasks").update({output:{error:String(e)},status:"failed",completed_at:new Date().toISOString()}).eq("id",t?.id??"");results[k]={error:String(e)};}
  }));
  return json({success:true,workspace_id:wsId,agents_run:keys.length,results});
});
