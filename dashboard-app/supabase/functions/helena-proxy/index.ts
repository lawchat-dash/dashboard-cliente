import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = 'pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY';
const BASE_URL = 'https://api.helena.run/crm/v1';

const DEFAULT_PANEL_ID = 'e6e830ea-b37a-4243-b656-eba8fa8ad4cd';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pageNumber = url.searchParams.get('pageNumber') || '1';
    const pageSize = url.searchParams.get('pageSize') || '100';
    const panelId = url.searchParams.get('panelId') || DEFAULT_PANEL_ID;

    const apiUrl = `${BASE_URL}/panel/card?PanelId=${panelId}&PageSize=${pageSize}&PageNumber=${pageNumber}&IncludeDetails=StepTitle&IncludeDetails=StepPhase&IncludeDetails=PanelTitle&IncludeDetails=ResponsibleUser&IncludeDetails=CustomFields&IncludeDetails=Contacts`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
