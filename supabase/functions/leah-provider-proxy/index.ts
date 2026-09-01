import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient } from "../_shared/admin-client.ts";
import { generateProvider, parseProviderId, ProviderKnownError, ProviderUnknownOutcomeError } from "../_shared/leah-provider-client.ts";

const admin = createAdminClient();
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
async function sha256(v:string){return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));}
function eq(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
async function requireWorker(req:Request){const configured=Deno.env.get("LEAH_WORKER_SECRET")?.trim()??"";const supplied=req.headers.get("X-Leah-Worker-Secret")?.trim()??"";if(configured.length<32||supplied.length<32)throw new Error("Worker authentication failed");const[a,b]=await Promise.all([sha256(configured),sha256(supplied)]);if(!eq(a,b))throw new Error("Worker authentication failed");}
function text(body:Record<string,unknown>,key:string,max:number){const v=body[key];if(typeof v!=="string"||!v.trim()||v.length>max)throw new Error(`${key} is required`);return v.trim();}
function optionalText(body:Record<string,unknown>,key:string,max:number){const v=body[key];if(v===undefined||v===null||v==="")return null;if(typeof v!=="string"||!v.trim()||v.length>max)throw new Error(`Invalid ${key}`);return v.trim();}
function uuid(body:Record<string,unknown>,key:string){const v=text(body,key,64);if(!UUID_RE.test(v))throw new Error(`${key} must be a UUID`);return v;}
function nullableInteger(body:Record<string,unknown>,key:string,max=20_000_000){const v=body[key];if(v===undefined||v===null)return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error(`Invalid ${key}`);return n;}
function bool(body:Record<string,unknown>,key:string){const v=body[key];if(typeof v!=="boolean")throw new Error(`Invalid ${key}`);return v;}
function objectField(body:Record<string,unknown>,key:string){const v=body[key];if(v===undefined||v===null)return{};if(!v||typeof v!=="object"||Array.isArray(v))throw new Error(`Invalid ${key}`);return v as Record<string,unknown>;}
function rejectAuthorityInjection(body:Record<string,unknown>){for(const key of ["workspace_id","workspaceId","user_id","userId","api_key","apiKey","base_url","baseUrl","secret_id","secretId","model","billing_mode","billingMode"]){if(Object.prototype.hasOwnProperty.call(body,key))throw new Error(`${key} is server-derived`);}}
function usageArgs(u:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;usageSource:string}){return {_usage_source:u.usageSource,_input_tokens:u.inputTokens,_output_tokens:u.outputTokens,_total_tokens:u.totalTokens};}

serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  let admitted=false;let taskId="";let leaseToken="";let attemptId="";let logicalRequestId="";let provider="";let model="";let startedAt=Date.now();
  try{
    await requireWorker(req);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    rejectAuthorityInjection(body);
    const action=text(body,"action",40);
    taskId=uuid(body,"task_id");leaseToken=uuid(body,"lease_token");

    if(action==="catalog"){
      const {data,error}=await admin.rpc("leah_list_byok_providers_for_task",{_task_id:taskId,_lease_token:leaseToken});
      if(error)throw error;
      return json({providers:Array.isArray(data)?data:[]});
    }

    if(action==="settle"){
      attemptId=uuid(body,"attempt_id");
      const outcome=text(body,"outcome",20);
      const usageSource=text(body,"usage_source",20);
      if(!new Set(["succeeded","failed"]).has(outcome))throw new Error("Invalid provider settlement outcome");
      if(!new Set(["provider","estimated","unavailable"]).has(usageSource))throw new Error("Invalid usage_source");
      const {data,error}=await admin.rpc("leah_finalize_byok_provider_attempt",{
        _task_id:taskId,
        _lease_token:leaseToken,
        _attempt_id:attemptId,
        _outcome:outcome,
        _provider_request_id:optionalText(body,"provider_request_id",500),
        _usage_source:usageSource,
        _input_tokens:nullableInteger(body,"input_tokens",10_000_000),
        _output_tokens:nullableInteger(body,"output_tokens",10_000_000),
        _total_tokens:nullableInteger(body,"total_tokens",20_000_000),
        _error_code:optionalText(body,"error_code",120),
        _latency_ms:nullableInteger(body,"latency_ms",86_400_000),
        _canonical_result:bool(body,"canonical_result"),
        _metadata:{...objectField(body,"metadata"),settled_by:"leah_application_validation"},
      });
      if(error)throw error;
      return json({settlement:data});
    }

    if(action!=="generate")throw new Error("Unknown LEAH provider proxy action");
    attemptId=uuid(body,"attempt_id");logicalRequestId=uuid(body,"logical_request_id");provider=parseProviderId(text(body,"provider",40));
    const system=text(body,"system",20000);const user=text(body,"user",250000);startedAt=Date.now();

    const {data:resolved,error:resolveError}=await admin.rpc("leah_resolve_byok_provider_for_task",{_task_id:taskId,_lease_token:leaseToken,_provider:provider});
    if(resolveError)throw resolveError;
    if(!resolved||typeof resolved!=="object")throw new Error("LEAH provider binding unavailable");
    const credential=resolved as Record<string,unknown>;
    model=typeof credential.model==="string"?credential.model.trim():"";
    const apiKey=typeof credential.secret_value==="string"?credential.secret_value:"";
    if(!model||!apiKey)throw new Error("Secret unavailable");

    const {error:beginError}=await admin.rpc("leah_begin_provider_attempt",{_task_id:taskId,_lease_token:leaseToken,_logical_request_id:logicalRequestId,_attempt_id:attemptId,_billing_mode:"byok",_provider:provider,_model:model,_reservation_id:null,_metadata:{proxy:"pulse",credential_scope:"task-derived"}});
    if(beginError)throw beginError;admitted=true;

    let result;
    try{result=await generateProvider({provider:parseProviderId(provider),apiKey,model,system,user});}
    catch(error){
      const latency=Date.now()-startedAt;
      if(error instanceof ProviderUnknownOutcomeError){
        const {error:settleError}=await admin.rpc("leah_finalize_byok_provider_attempt",{_task_id:taskId,_lease_token:leaseToken,_attempt_id:attemptId,_outcome:"unknown",_provider_request_id:null,_usage_source:"unavailable",_input_tokens:null,_output_tokens:null,_total_tokens:null,_error_code:"outcome_unknown",_latency_ms:latency,_canonical_result:false,_metadata:{proxy:"pulse",settled_by:"proxy"}});
        if(settleError)throw new Error("LEAH_PROVIDER_EVIDENCE_SETTLEMENT_FAILED");
        return json({error:"provider_outcome_unknown",provider,model},409);
      }
      const code=error instanceof ProviderKnownError?error.code:"provider_failure";
      const {error:settleError}=await admin.rpc("leah_finalize_byok_provider_attempt",{_task_id:taskId,_lease_token:leaseToken,_attempt_id:attemptId,_outcome:"failed",_provider_request_id:null,_usage_source:"unavailable",_input_tokens:null,_output_tokens:null,_total_tokens:null,_error_code:code,_latency_ms:latency,_canonical_result:false,_metadata:{proxy:"pulse",settled_by:"proxy"}});
      if(settleError)throw new Error("LEAH_PROVIDER_EVIDENCE_SETTLEMENT_FAILED");
      const status=error instanceof ProviderKnownError&&[400,401,402,403,404,408,429].includes(error.status)?error.status:502;
      return json({error:code,provider,model},status);
    }

    const latency=Date.now()-startedAt;
    if(!result.valid){
      const {error:settleError}=await admin.rpc("leah_finalize_byok_provider_attempt",{_task_id:taskId,_lease_token:leaseToken,_attempt_id:attemptId,_outcome:"failed",_provider_request_id:result.providerRequestId,...usageArgs(result.usage),_error_code:"invalid_provider_output",_latency_ms:latency,_canonical_result:false,_metadata:{proxy:"pulse",finish_reason:result.finishReason,provider_response_valid:false,settled_by:"proxy"}});
      if(settleError)throw new Error("LEAH_PROVIDER_EVIDENCE_SETTLEMENT_FAILED");
      return json({error:"invalid_provider_output",provider,model,usage:result.usage,provider_request_id:result.providerRequestId},502);
    }

    return json({ok:true,provider,model,text:result.text,usage:result.usage,provider_request_id:result.providerRequestId,finish_reason:result.finishReason,latency_ms:latency,settlement_pending:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown error";
    if(admitted&&message!=="LEAH_PROVIDER_EVIDENCE_SETTLEMENT_FAILED")return json({error:"provider_attempt_reconciliation_required"},409);
    const status=message==="Worker authentication failed"?401:message.includes("BYOK_DISABLED")||message.includes("entitlement inactive")||message.includes("Forbidden")?403:message.includes("server-derived")||message.includes("required")||message.includes("UUID")||message.startsWith("Invalid")||message.startsWith("Unknown")?400:message.includes("unavailable")?404:500;
    return json({error:status===500?"Internal LEAH provider proxy error":message},status);
  }
});