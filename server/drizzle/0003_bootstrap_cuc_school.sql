INSERT INTO "schools" ("id", "code", "name", "status")
VALUES (
	'10000000-0000-4000-8000-000000000002',
	'CUC',
	'中国传媒大学',
	'ACTIVE'
)
ON CONFLICT ("code") DO UPDATE SET
	"name" = EXCLUDED."name",
	"status" = 'ACTIVE',
	"updated_at" = now();
