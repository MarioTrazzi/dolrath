-- Verificar se os campos de transformação existem no banco Neon
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Character' 
  AND column_name IN ('isTransformed', 'transformationType', 'transformationData')
ORDER BY column_name;
