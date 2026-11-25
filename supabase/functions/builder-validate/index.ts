// builder-validate: DISABLED after Phase 2B lifecycle validation complete.
// Returns 410 Gone — do not re-enable without explicit intent.
Deno.serve(()=>new Response(JSON.stringify({error:"Gone",reason:"Phase 2B validation complete. builder-validate is permanently disabled.",phase:"2b_complete"}),{status:410,headers:{"Content-Type":"application/json"}}));
