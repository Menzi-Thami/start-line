-- Read-only capacity report for Azure SQL Database. Run against Taperday's database using an authorised
-- administrator/monitoring connection. Requires access to database metadata; returns no runner information.
-- Used space includes tables and indexes. Allocated-but-unused data-file space can be reused.
-- This reads metadata on demand; it creates no resources, changes no data, and schedules no polling.
WITH file_usage AS
(
    SELECT
        SUM(CONVERT(bigint, FILEPROPERTY(name, 'SpaceUsed'))) * 8192 AS used_bytes,
        SUM(CONVERT(bigint, size)) * 8192 AS allocated_bytes
    FROM sys.database_files
    WHERE type = 0
), capacity AS
(
    SELECT CONVERT(bigint, DATABASEPROPERTYEX(DB_NAME(), 'MaxSizeInBytes')) AS limit_bytes
)
SELECT
    DB_NAME() AS DatabaseName,
    CAST(used_bytes / 1048576.0 AS decimal(18, 2)) AS UsedMiB,
    CAST(allocated_bytes / 1048576.0 AS decimal(18, 2)) AS AllocatedMiB,
    CAST(limit_bytes / 1048576.0 AS decimal(18, 2)) AS LimitMiB,
    CAST(100.0 * used_bytes / NULLIF(limit_bytes, 0) AS decimal(6, 2)) AS UsedPercent
FROM file_usage
CROSS JOIN capacity;

-- Largest tables including all their indexes. Row counts are metadata estimates; count base rows once.
SELECT TOP (15)
    s.name AS SchemaName,
    t.name AS TableName,
    SUM(CASE WHEN p.index_id IN (0, 1) THEN p.row_count ELSE 0 END) AS EstimatedRows,
    CAST(SUM(p.used_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS UsedMiB,
    CAST(SUM(p.reserved_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS ReservedMiB
FROM sys.dm_db_partition_stats AS p
JOIN sys.tables AS t ON p.object_id = t.object_id
JOIN sys.schemas AS s ON t.schema_id = s.schema_id
GROUP BY s.name, t.name
ORDER BY SUM(p.used_page_count) DESC;
