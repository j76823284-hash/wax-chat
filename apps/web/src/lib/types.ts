export interface Profile {
  wax_account: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface ChannelToken {
  contract: string;
  symbol: string;
  precision: number;
  logo_url: string | null;
}

export interface Channel {
  id: string;
  owner_wax: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  is_public: boolean;
  token_contract: string | null;
  token_symbol: string | null;
  token_precision: number | null;
  token_logo_url: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  sender_wax: string;
  body: string | null;
  media_url: string | null;
  reply_to: string | null;
  created_at: string;
}

export function channelToken(c: Channel): ChannelToken | null {
  if (!c.token_contract || !c.token_symbol) return null;
  return {
    contract: c.token_contract,
    symbol: c.token_symbol,
    precision: c.token_precision ?? 0,
    logo_url: c.token_logo_url,
  };
}
