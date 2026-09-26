import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(() =>
  new Response(JSON.stringify({ error: "seed endpoint is closed" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  }),
)
