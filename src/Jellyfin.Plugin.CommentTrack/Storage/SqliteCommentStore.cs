using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.CommentTrack.Api.Dto;
using MediaBrowser.Common.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.CommentTrack.Storage;

/// <summary>
/// SQLite-backed <see cref="ICommentStore"/>. One file under the server data dir;
/// connections are pooled by Microsoft.Data.Sqlite on the connection string.
/// The host has already initialised the native <c>e_sqlite3</c> provider.
/// </summary>
public sealed class SqliteCommentStore : ICommentStore, IDisposable
{
    private const string IsoFormat = "yyyy-MM-ddTHH:mm:ss.fffffffZ";

    private readonly ILogger<SqliteCommentStore> _logger;
    private readonly string _connectionString;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private bool _initialised;

    public SqliteCommentStore(IApplicationPaths applicationPaths, ILogger<SqliteCommentStore> logger)
    {
        _logger = logger;
        var dir = Path.Combine(applicationPaths.DataPath, "comment-track");
        Directory.CreateDirectory(dir);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(dir, "comments.db"),
            Pooling = true,
        }.ToString();
    }

    public async Task<IReadOnlyList<CommentDto>> GetForItemAsync(Guid itemId, Guid callerId, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT id, item_id, position_ms, body, user_name, created_at, user_id FROM comments "
            + "WHERE item_id = $item AND deleted = 0 ORDER BY position_ms, created_at";
        cmd.Parameters.AddWithValue("$item", Key(itemId));

        return await ReadListAsync(cmd, Key(callerId), cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<CommentDto>> GetForUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var key = Key(userId);
        var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT id, item_id, position_ms, body, user_name, created_at, user_id FROM comments "
            + "WHERE user_id = $user AND deleted = 0 ORDER BY created_at DESC";
        cmd.Parameters.AddWithValue("$user", key);

        return await ReadListAsync(cmd, key, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<CommentDto>> GetAllAsync(int limit, Guid callerId, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText =
            "SELECT id, item_id, position_ms, body, user_name, created_at, user_id FROM comments "
            + "WHERE deleted = 0 ORDER BY created_at DESC LIMIT $limit";
        cmd.Parameters.AddWithValue("$limit", limit);

        return await ReadListAsync(cmd, Key(callerId), cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyDictionary<Guid, int>> CountByItemsAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, int>();
        if (itemIds.Count == 0)
        {
            return result;
        }

        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        var placeholders = new List<string>();
        var i = 0;
        foreach (var id in itemIds)
        {
            var name = "$i" + i.ToString(CultureInfo.InvariantCulture);
            placeholders.Add(name);
            cmd.Parameters.AddWithValue(name, Key(id));
            i++;
        }

        cmd.CommandText =
            "SELECT item_id, COUNT(*) FROM comments WHERE deleted = 0 AND item_id IN ("
            + string.Join(",", placeholders) + ") GROUP BY item_id";

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            if (Guid.TryParse(reader.GetString(0), out var itemId))
            {
                result[itemId] = reader.GetInt32(1);
            }
        }

        return result;
    }

    private static async Task<IReadOnlyList<CommentDto>> ReadListAsync(SqliteCommand cmd, string callerKey, CancellationToken cancellationToken)
    {
        var result = new List<CommentDto>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            result.Add(new CommentDto
            {
                Id = Guid.Parse(reader.GetString(0)),
                ItemId = Guid.Parse(reader.GetString(1)),
                PositionMs = reader.GetInt64(2),
                Body = reader.GetString(3),
                UserName = reader.GetString(4),
                CreatedAt = DateTime.ParseExact(
                    reader.GetString(5),
                    IsoFormat,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal),
                UserId = Guid.Parse(reader.GetString(6)),
                Mine = string.Equals(reader.GetString(6), callerKey, StringComparison.OrdinalIgnoreCase),
            });
        }

        return result;
    }

    public async Task<CommentDto> AddAsync(
        Guid itemId,
        long positionMs,
        string body,
        Guid userId,
        string userName,
        CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var dto = new CommentDto
        {
            Id = Guid.NewGuid(),
            ItemId = itemId,
            UserId = userId,
            PositionMs = positionMs,
            Body = body,
            UserName = userName,
            CreatedAt = DateTime.UtcNow,
        };

        var cmd = conn.CreateCommand();
        cmd.CommandText =
            "INSERT INTO comments (id, item_id, position_ms, body, user_id, user_name, created_at, deleted) "
            + "VALUES ($id, $item, $pos, $body, $user, $name, $created, 0)";
        cmd.Parameters.AddWithValue("$id", Key(dto.Id));
        cmd.Parameters.AddWithValue("$item", Key(itemId));
        cmd.Parameters.AddWithValue("$pos", positionMs);
        cmd.Parameters.AddWithValue("$body", body);
        cmd.Parameters.AddWithValue("$user", Key(userId));
        cmd.Parameters.AddWithValue("$name", userName);
        cmd.Parameters.AddWithValue("$created", dto.CreatedAt.ToString(IsoFormat, CultureInfo.InvariantCulture));
        await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

        return dto;
    }

    public async Task<int> CountRecentByUserAsync(Guid userId, DateTime sinceUtc, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM comments WHERE user_id = $user AND created_at >= $since";
        cmd.Parameters.AddWithValue("$user", Key(userId));
        cmd.Parameters.AddWithValue("$since", sinceUtc.ToUniversalTime().ToString(IsoFormat, CultureInfo.InvariantCulture));

        var scalar = await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return Convert.ToInt32(scalar, CultureInfo.InvariantCulture);
    }

    public async Task<MutationResult> UpdateBodyAsync(Guid commentId, string body, Guid callerId, bool callerIsAdmin, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var gate = await CheckOwnershipAsync(conn, commentId, callerId, callerIsAdmin, cancellationToken).ConfigureAwait(false);
        if (gate != MutationResult.Ok)
        {
            return gate;
        }

        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE comments SET body = $body WHERE id = $id AND deleted = 0";
        cmd.Parameters.AddWithValue("$body", body);
        cmd.Parameters.AddWithValue("$id", Key(commentId));
        var affected = await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return affected > 0 ? MutationResult.Ok : MutationResult.NotFound;
    }

    public async Task<MutationResult> SoftDeleteAsync(Guid commentId, Guid callerId, bool callerIsAdmin, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var gate = await CheckOwnershipAsync(conn, commentId, callerId, callerIsAdmin, cancellationToken).ConfigureAwait(false);
        if (gate != MutationResult.Ok)
        {
            return gate;
        }

        var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE comments SET deleted = 1 WHERE id = $id AND deleted = 0";
        cmd.Parameters.AddWithValue("$id", Key(commentId));
        var affected = await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return affected > 0 ? MutationResult.Ok : MutationResult.NotFound;
    }

    /// <summary>Ok = caller may mutate; otherwise NotFound / Forbidden.</summary>
    private async Task<MutationResult> CheckOwnershipAsync(
        SqliteConnection conn, Guid commentId, Guid callerId, bool callerIsAdmin, CancellationToken cancellationToken)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT user_id FROM comments WHERE id = $id AND deleted = 0";
        cmd.Parameters.AddWithValue("$id", Key(commentId));
        var owner = (string?)await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        if (owner is null)
        {
            return MutationResult.NotFound;
        }

        return callerIsAdmin || string.Equals(owner, Key(callerId), StringComparison.OrdinalIgnoreCase)
            ? MutationResult.Ok
            : MutationResult.Forbidden;
    }

    public async Task<string?> GetUserPrefsAsync(Guid userId, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT settings FROM user_prefs WHERE user_id = $user";
        cmd.Parameters.AddWithValue("$user", Key(userId));
        return (string?)await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task SetUserPrefsAsync(Guid userId, string json, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText =
            "INSERT INTO user_prefs (user_id, settings, updated_at) VALUES ($user, $json, $now) "
            + "ON CONFLICT (user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at";
        cmd.Parameters.AddWithValue("$user", Key(userId));
        cmd.Parameters.AddWithValue("$json", json);
        cmd.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString(IsoFormat, CultureInfo.InvariantCulture));
        await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<int> ClearAllUserPrefsAsync(CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "DELETE FROM user_prefs";
        return await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> IsUserBlockedAsync(Guid userId, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT blocked FROM user_policy WHERE user_id = $user";
        cmd.Parameters.AddWithValue("$user", Key(userId));
        var scalar = await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
        return scalar is not null && Convert.ToInt64(scalar, CultureInfo.InvariantCulture) != 0;
    }

    public async Task SetUserBlockedAsync(Guid userId, bool blocked, CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        if (blocked)
        {
            cmd.CommandText =
                "INSERT INTO user_policy (user_id, blocked, updated_at) VALUES ($user, 1, $now) "
                + "ON CONFLICT (user_id) DO UPDATE SET blocked = 1, updated_at = excluded.updated_at";
            cmd.Parameters.AddWithValue("$now", DateTime.UtcNow.ToString(IsoFormat, CultureInfo.InvariantCulture));
        }
        else
        {
            cmd.CommandText = "DELETE FROM user_policy WHERE user_id = $user";
        }

        cmd.Parameters.AddWithValue("$user", Key(userId));
        await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyCollection<Guid>> GetBlockedUserIdsAsync(CancellationToken cancellationToken)
    {
        await EnsureInitialisedAsync(cancellationToken).ConfigureAwait(false);
        await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);

        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT user_id FROM user_policy WHERE blocked = 1";

        var ids = new List<Guid>();
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            if (Guid.TryParse(reader.GetString(0), out var id))
            {
                ids.Add(id);
            }
        }

        return ids;
    }

    public void Dispose() => _initLock.Dispose();

    private static string Key(Guid value) => value.ToString("D", CultureInfo.InvariantCulture);

    private async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(cancellationToken).ConfigureAwait(false);
        return conn;
    }

    private async Task EnsureInitialisedAsync(CancellationToken cancellationToken)
    {
        if (_initialised)
        {
            return;
        }

        await _initLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_initialised)
            {
                return;
            }

            await using var conn = await OpenAsync(cancellationToken).ConfigureAwait(false);
            var cmd = conn.CreateCommand();
            cmd.CommandText = ReadSchema();
            await cmd.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            _initialised = true;
            _logger.LogInformation("Comment Track: SQLite store ready.");
        }
        finally
        {
            _initLock.Release();
        }
    }

    private static string ReadSchema()
    {
        var asm = typeof(SqliteCommentStore).Assembly;
        using var stream = asm.GetManifestResourceStream("Jellyfin.Plugin.CommentTrack.Storage.schema.sql")
            ?? throw new InvalidOperationException("Embedded schema.sql not found.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
