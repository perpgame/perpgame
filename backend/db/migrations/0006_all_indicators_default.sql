ALTER TABLE agent_settings
  ALTER COLUMN enabled_indicators
  SET DEFAULT '{"rsi","macd","stochastic","williams_r","cci","mfi","roc","aroon","vortex","trix","adx","parabolic_sar","ema","sma","bollinger_bands","keltner_channels","donchian_channels","atr","obv"}';
