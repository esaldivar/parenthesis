using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Parent-to-parent messaging (#125, docs/design/m4-chat.md slice 1): two parents, a child on the kitchen iPad, another
/// household, and the live hub. Names and messages are synthetic.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ChatTests(ApiFactory api) : IAsyncLifetime
{
    private const string KaisPin = "2580";
    private const string DadsPin = "583920";
    private const string SessionCookie = "__Host-parenthesis";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Two_parents_exchange_messages_with_read_receipts_and_unread_counts()
    {
        using var f = await FamilyAsync();

        var question = await SendAsync(f.Mom, f, "Can you do the soccer pickup on Saturday?");
        Assert.True(question.GetProperty("yours").GetBoolean());
        Assert.Equal(1, (await UnreadAsync(f.Dad, f)).GetProperty("count").GetInt32());
        Assert.Equal(0, (await UnreadAsync(f.Mom, f)).GetProperty("count").GetInt32()); // sending reads your own messages

        // Dad's view: Mom's message isn't his, and nothing is read yet.
        var dadView = await ConversationAsync(f.Dad, f);
        var only = Assert.Single(dadView.GetProperty("messages").EnumerateArray());
        Assert.False(only.GetProperty("yours").GetBoolean());
        Assert.Equal("Can you do the soccer pickup on Saturday?", only.GetProperty("text").GetString());
        Assert.Equal(JsonValueKind.Null, dadView.GetProperty("yourReadThrough").ValueKind);

        // Dad reads it: Mom sees the receipt and his unread dot clears.
        Assert.Equal(HttpStatusCode.NoContent, (await ReadAsync(f.Dad, f, question.GetProperty("id").GetGuid())).StatusCode);
        Assert.Equal(0, (await UnreadAsync(f.Dad, f)).GetProperty("count").GetInt32());
        Assert.Equal(question.GetProperty("id").GetGuid(), (await ConversationAsync(f.Mom, f)).GetProperty("coParentReadThrough").GetGuid());

        var answer = await SendAsync(f.Dad, f, "Yes, I can. What time is it again?");
        var momView = await ConversationAsync(f.Mom, f);
        Assert.Equal(
            ["Can you do the soccer pickup on Saturday?", "Yes, I can. What time is it again?"],
            momView.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("text").GetString()));
        Assert.Equal(answer.GetProperty("senderMembershipId").GetGuid(), f.DadMembershipId);
        Assert.Equal(1, (await UnreadAsync(f.Mom, f)).GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task A_retried_send_returns_the_stored_message_instead_of_a_second_copy()
    {
        using var f = await FamilyAsync();
        var clientId = Guid.NewGuid();

        var first = await f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = clientId, text = "Got it. I'll be there at 11:45." });
        var retry = await f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = clientId, text = "Got it. I'll be there at 11:45." });
        // Repeated clicks arriving together still store one message.
        var racing = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ =>
            f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.Parse("0f0e0d0c-0b0a-4908-8706-050403020100"), text = "Sure, no problem." })));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal((await JsonAsync(first)).GetProperty("id").GetGuid(), (await JsonAsync(retry)).GetProperty("id").GetGuid());
        Assert.All(racing, r => Assert.True(r.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, r.StatusCode.ToString()));
        Assert.Equal(1, racing.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(2, (await ConversationAsync(f.Mom, f)).GetProperty("messages").GetArrayLength());

        // The id is per sender: Mom's device happening to use the same id stores her own message.
        Assert.Equal(HttpStatusCode.Created, (await f.Mom.PostAsync(f.Path("chat/messages"), new { clientMessageId = clientId, text = "Thanks!" })).StatusCode);
    }

    [Fact]
    public async Task Read_positions_only_move_forward()
    {
        using var f = await FamilyAsync();
        var first = await SendAsync(f.Mom, f, "Game ends at 11:30.");
        var second = await SendAsync(f.Mom, f, "So pickup around 11:45 at the field.");

        await ReadAsync(f.Dad, f, second.GetProperty("id").GetGuid());
        await ReadAsync(f.Dad, f, first.GetProperty("id").GetGuid()); // a stale tab reporting an older message

        Assert.Equal(second.GetProperty("id").GetGuid(), (await ConversationAsync(f.Dad, f)).GetProperty("yourReadThrough").GetGuid());
        Assert.Equal(second.GetProperty("id").GetGuid(), (await ConversationAsync(f.Mom, f)).GetProperty("coParentReadThrough").GetGuid());
        Assert.Equal(0, (await UnreadAsync(f.Dad, f)).GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task History_comes_in_pages_of_fifty_oldest_first()
    {
        using var f = await FamilyAsync();
        for (var i = 1; i <= 55; i++)
        {
            await SendAsync(i % 2 == 0 ? f.Dad : f.Mom, f, $"Message {i}");
        }

        var latest = await ConversationAsync(f.Dad, f);
        var texts = latest.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("text").GetString()).ToList();
        Assert.Equal(50, texts.Count);
        Assert.Equal("Message 6", texts[0]);
        Assert.Equal("Message 55", texts[^1]);
        Assert.True(latest.GetProperty("hasOlder").GetBoolean());

        var before = latest.GetProperty("messages")[0].GetProperty("id").GetGuid();
        var older = await JsonAsync(await f.Dad.GetAsync(f.Path($"chat?before={before}")));
        Assert.Equal(["Message 1", "Message 2", "Message 3", "Message 4", "Message 5"], older.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("text").GetString()));
        Assert.False(older.GetProperty("hasOlder").GetBoolean());
        // Dad's own sends mark the conversation read up to them, so only Mom's last message is new to him.
        Assert.Equal(1, (await UnreadAsync(f.Dad, f)).GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Text_only_with_a_length_limit_and_an_id_per_message()
    {
        using var f = await FamilyAsync();

        foreach (var (body, field) in new (object Body, string Field)[]
        {
            (new { clientMessageId = Guid.NewGuid(), text = "" }, "text"),
            (new { clientMessageId = Guid.NewGuid(), text = "   \n  " }, "text"),
            (new { clientMessageId = Guid.NewGuid(), text = new string('a', 2001) }, "text"),
            (new { text = "Hello" }, "clientMessageId"),
            (new { clientMessageId = Guid.Empty, text = "Hello" }, "clientMessageId"),
        })
        {
            var response = await f.Dad.PostAsync(f.Path("chat/messages"), body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty(field, out _), field);
        }

        // 2,000 characters fit; surrounding whitespace and Windows line endings are tidied.
        Assert.Equal(HttpStatusCode.Created, (await f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text = new string('a', 2000) })).StatusCode);
        var tidy = await SendAsync(f.Dad, f, "  Line one\r\nLine two  ");
        Assert.Equal("Line one\nLine two", tidy.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Messages_can_never_be_edited_or_deleted()
    {
        using var f = await FamilyAsync();
        var message = await SendAsync(f.Dad, f, "I'll bring the water bottles.");
        var path = f.Path($"chat/messages/{message.GetProperty("id").GetGuid()}");

        foreach (var method in new[] { HttpMethod.Put, HttpMethod.Patch, HttpMethod.Delete })
        {
            var response = await f.Dad.SendAsync(method, path, new { text = "Changed" });
            Assert.True(response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, $"{method}: {response.StatusCode}");
        }

        Assert.Equal("I'll bring the water bottles.", Assert.Single((await ConversationAsync(f.Mom, f)).GetProperty("messages").EnumerateArray()).GetProperty("text").GetString());
    }

    [Fact]
    public async Task Children_other_families_strangers_and_guessed_ids_get_nothing()
    {
        using var f = await FamilyAsync();
        var message = await SendAsync(f.Dad, f, "Can you also bring the water bottles?");
        var messageId = message.GetProperty("id").GetGuid();

        // Kai on the kitchen iPad: children have no chat access at all.
        using var kitchen = await KitchenAsync(f);
        foreach (var url in new[] { f.Path("chat"), f.Path("chat/unread"), f.Path($"chat?before={messageId}") })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.GetAsync(url)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text = "Hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.SendAsync(HttpMethod.Put, f.Path("chat/read"), new { messageId })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.PostAsync(f.Path("chat/typing"))).StatusCode);

        // Another family's parent, with this family's URLs or this message's id in their own family.
        using var other = await ApiSession.SignedInAsync(api, displayName: "Sam");
        var otherFamily = await other.CreateFamilyAsync("Okafor Family");
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(f.Path("chat"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text = "Hi" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/families/{otherFamily}/chat?before={messageId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Put, $"/api/families/{otherFamily}/chat/read", new { messageId })).StatusCode);
        Assert.Empty((await JsonAsync(await other.GetAsync($"/api/families/{otherFamily}/chat"))).GetProperty("messages").EnumerateArray());

        // A guessed id in the parent's own family, and nobody signed in.
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.SendAsync(HttpMethod.Put, f.Path("chat/read"), new { messageId = Guid.CreateVersion7() })).StatusCode);
        using var anonymous = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(f.Path("chat"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text = "Hi" }, withAntiforgery: false)).StatusCode);
    }

    [Fact]
    public async Task A_parent_who_deletes_their_account_leaves_the_conversation_for_the_co_parent()
    {
        using var f = await FamilyAsync();
        await SendAsync(f.Mom, f, "Here's the plan for Saturday.");
        await SendAsync(f.Dad, f, "Sounds good.");

        Assert.Equal(HttpStatusCode.NoContent, (await f.Mom.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);

        var dadView = await ConversationAsync(f.Dad, f);
        Assert.Equal(["Here's the plan for Saturday.", "Sounds good."], dadView.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("text").GetString()));
        Assert.Equal(JsonValueKind.Null, dadView.GetProperty("coParentReadThrough").ValueKind);
    }

    [Fact]
    public async Task The_hub_pushes_messages_reads_and_typing_to_parents_watching_the_family()
    {
        using var f = await FamilyAsync();
        await using var dadHub = await HubAsync(f.Dad, f.DadEmail);
        var message = Expect(dadHub, "message");
        var read = Expect(dadHub, "read");
        var typing = Expect(dadHub, "typing");
        await dadHub.InvokeAsync("Watch", f.FamilyId, Ct);

        Assert.Equal(HttpStatusCode.NoContent, (await f.Mom.PostAsync(f.Path("chat/typing"))).StatusCode);
        var sent = await SendAsync(f.Mom, f, "Thanks! Can you also bring the water bottles?");

        Assert.Equal(f.MomMembershipId, (await typing).GetProperty("membershipId").GetGuid());
        var pushed = await message;
        Assert.Equal(sent.GetProperty("id").GetGuid(), pushed.GetProperty("id").GetGuid());
        Assert.Equal("Thanks! Can you also bring the water bottles?", pushed.GetProperty("text").GetString());
        Assert.Equal(f.MomMembershipId, pushed.GetProperty("senderMembershipId").GetGuid());
        Assert.Equal(sent.GetProperty("id").GetGuid(), (await read).GetProperty("messageId").GetGuid()); // the sender has read it
    }

    [Fact]
    public async Task The_hub_refuses_other_families_children_strangers_and_other_websites()
    {
        using var f = await FamilyAsync();

        // A parent of another family can connect, but can't watch this one (or one that doesn't exist).
        var otherEmail = ApiSession.NewEmail();
        using var other = await ApiSession.SignedInAsync(api, displayName: "Sam", email: otherEmail);
        await using var otherHub = await HubAsync(other, otherEmail);
        await Assert.ThrowsAsync<HubException>(() => otherHub.InvokeAsync("Watch", f.FamilyId, Ct));
        await Assert.ThrowsAsync<HubException>(() => otherHub.InvokeAsync("Watch", Guid.CreateVersion7(), Ct));

        // Nobody signed in, and a child session, can't open a connection at all.
        using var anonymous = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.Client.PostAsync("/hubs/chat/negotiate?negotiateVersion=1", null, Ct)).StatusCode);
        using var kitchen = await KitchenAsync(f);
        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.Client.PostAsync("/hubs/chat/negotiate?negotiateVersion=1", null, Ct)).StatusCode);

        // A page on another website can't use a parent's cookie to connect (cross-site WebSocket hijacking).
        using var crossSite = new HttpRequestMessage(HttpMethod.Post, "/hubs/chat/negotiate?negotiateVersion=1");
        crossSite.Headers.Add("Origin", "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Dad.Client.SendAsync(crossSite, Ct)).StatusCode);
        using var sameSite = new HttpRequestMessage(HttpMethod.Post, "/hubs/chat/negotiate?negotiateVersion=1");
        sameSite.Headers.Add("Origin", "https://localhost");
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.Client.SendAsync(sameSite, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_shared_event_shows_each_parent_its_card_as_their_own_calendar_does()
    {
        using var f = await FamilyAsync();
        var start = DateTimeOffset.UtcNow.AddDays(3).Date.AddHours(15);
        var game = await EventAsync(f.Dad, f, new { category = "Activity", title = "Soccer game", startsAt = start, endsAt = start.AddHours(2) });
        var play = await EventAsync(f.Dad, f, new { category = "Joint", title = "School play", startsAt = start.AddDays(1), endsAt = start.AddDays(1).AddHours(1) });
        var away = await EventAsync(f.Dad, f, new { category = "Unavailable", startsAt = start.AddDays(2), endsAt = start.AddDays(2).AddHours(3), notes = "Dentist appointment" });

        var withText = await SendEventAsync(f.Dad, f, "Here's the game info.", game);
        var onlyEvent = await SendEventAsync(f.Dad, f, null, play);
        var unavailable = await SendEventAsync(f.Dad, f, "I'm away that afternoon.", away);

        // The sender's own copy carries the card.
        var card = withText.GetProperty("event");
        Assert.True(card.GetProperty("available").GetBoolean());
        Assert.Equal("Soccer game", card.GetProperty("title").GetString());
        Assert.Equal("Confirmed", card.GetProperty("status").GetString());
        Assert.Equal("", onlyEvent.GetProperty("text").GetString());

        // Mom's conversation: the same cards, read with her calendar's rules. A proposal never reads as confirmed, and
        // unavailable time keeps its private reason to its owner.
        var moms = (await ConversationAsync(f.Mom, f)).GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("event")).ToList();
        Assert.Equal(["Soccer game", "School play", "Unavailable"], moms.Select(c => c.GetProperty("title").GetString()));
        Assert.Equal(["Confirmed", "Proposed", "Confirmed"], moms.Select(c => c.GetProperty("status").GetString()));
        Assert.DoesNotContain("Dentist", (await ConversationAsync(f.Mom, f)).GetRawText(), StringComparison.Ordinal);

        // One message, as a live push's reader gets it.
        var single = await JsonAsync(await f.Mom.GetAsync(f.Path($"chat/messages/{withText.GetProperty("id").GetGuid()}")));
        Assert.False(single.GetProperty("yours").GetBoolean());
        Assert.Equal("Soccer game", single.GetProperty("event").GetProperty("title").GetString());

        // Cancelled: both parents' cards say it's no longer available, and give nothing else away.
        Assert.Equal(HttpStatusCode.NoContent, (await f.Dad.SendAsync(HttpMethod.Delete, f.Path($"calendar/events/{away}"))).StatusCode);
        foreach (var parent in new[] { f.Dad, f.Mom })
        {
            var gone = (await ConversationAsync(parent, f)).GetProperty("messages")[2].GetProperty("event");
            Assert.False(gone.GetProperty("available").GetBoolean());
            Assert.Equal(away, gone.GetProperty("id").GetGuid());
            Assert.Equal(JsonValueKind.Null, gone.GetProperty("title").ValueKind);
            Assert.Equal(JsonValueKind.Null, gone.GetProperty("startsAt").ValueKind);
        }

        // The message itself stays: messages are never edited or deleted.
        Assert.Equal("I'm away that afternoon.", (await ConversationAsync(f.Mom, f)).GetProperty("messages")[2].GetProperty("text").GetString());
    }

    [Fact]
    public async Task Only_an_event_on_the_senders_own_calendar_can_be_shared()
    {
        using var f = await FamilyAsync();
        using var stranger = await ApiSession.SignedInAsync(api, displayName: "Stranger");
        var otherFamily = await stranger.CreateFamilyAsync("Other Family");
        var start = DateTimeOffset.UtcNow.AddDays(3);
        var theirs = await JsonAsync(await stranger.PostAsync($"/api/families/{otherFamily}/calendar/events", new
        {
            category = "Activity",
            title = "Secret soccer",
            startsAt = start,
            endsAt = start.AddHours(1),
        }));
        var cancelled = await EventAsync(f.Dad, f, new { category = "Activity", title = "Swim", startsAt = start, endsAt = start.AddHours(1) });
        Assert.Equal(HttpStatusCode.NoContent, (await f.Dad.SendAsync(HttpMethod.Delete, f.Path($"calendar/events/{cancelled}"))).StatusCode);

        foreach (var eventId in new[] { theirs.GetProperty("id").GetGuid(), cancelled, Guid.CreateVersion7() })
        {
            var response = await f.Dad.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text = "Look", eventId });
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("eventId", out _));
        }

        Assert.Equal(0, (await ConversationAsync(f.Mom, f)).GetProperty("messages").GetArrayLength());
        Assert.DoesNotContain("Secret", (await ConversationAsync(f.Dad, f)).GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task One_message_is_only_for_the_familys_parents()
    {
        using var f = await FamilyAsync();
        var message = await SendAsync(f.Dad, f, "Hi");
        var path = f.Path($"chat/messages/{message.GetProperty("id").GetGuid()}");
        using var kitchen = await KitchenAsync(f);
        using var other = await ApiSession.SignedInAsync(api, displayName: "Stranger");

        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(f.Path($"chat/messages/{Guid.CreateVersion7()}"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync(path)).StatusCode);
    }

    // ---------- Helpers ----------

    private static async Task<Guid> EventAsync(ApiSession parent, TestFamily f, object body)
    {
        var response = await parent.PostAsync(f.Path("calendar/events"), body);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync(Ct));
        return (await JsonAsync(response)).GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> SendEventAsync(ApiSession parent, TestFamily f, string? text, Guid eventId)
    {
        var response = await parent.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text, eventId });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await JsonAsync(response);
    }

    private static async Task<JsonElement> SendAsync(ApiSession parent, TestFamily f, string text)
    {
        var response = await parent.PostAsync(f.Path("chat/messages"), new { clientMessageId = Guid.NewGuid(), text });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await JsonAsync(response);
    }

    private static Task<HttpResponseMessage> ReadAsync(ApiSession parent, TestFamily f, Guid messageId) =>
        parent.SendAsync(HttpMethod.Put, f.Path("chat/read"), new { messageId });

    private static async Task<JsonElement> ConversationAsync(ApiSession parent, TestFamily f)
    {
        var response = await parent.GetAsync(f.Path("chat"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static async Task<JsonElement> UnreadAsync(ApiSession parent, TestFamily f) => await JsonAsync(await parent.GetAsync(f.Path("chat/unread")));

    /// <summary>A hub connection signed in as <paramref name="email"/>, over long polling (the test server has no sockets).</summary>
    private async Task<HubConnection> HubAsync(ApiSession session, string email)
    {
        var login = await session.LoginAsync(email);
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        var cookie = ApiSession.FindSetCookie(login, SessionCookie)!.Split(';')[0];
        var connection = new HubConnectionBuilder()
            .WithUrl("https://localhost/hubs/chat", options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => api.Server.CreateHandler();
                options.Headers["Cookie"] = cookie;
                options.Headers[TestClientAddress.Header] = TestClientAddress.Next();
            })
            .Build();
        await connection.StartAsync(Ct);
        return connection;
    }

    private static Task<JsonElement> Expect(HubConnection connection, string name)
    {
        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<JsonElement>(name, payload => received.TrySetResult(payload));
        return received.Task.WaitAsync(TimeSpan.FromSeconds(10), Ct);
    }

    private async Task<ApiSession> KitchenAsync(TestFamily f)
    {
        var kitchen = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.LoginAsync(f.DadEmail)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await kitchen.PostAsync(f.Path("devices/household"), new { name = "Kitchen iPad", pin = DadsPin })).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PostAsync("/api/device/switch")).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PostAsync("/api/device/child-session", new { childId = f.KaiId, pin = KaisPin })).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        return kitchen;
    }

    private async Task<TestFamily> FamilyAsync()
    {
        var dadEmail = ApiSession.NewEmail();
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad", email: dadEmail);
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kai.GetProperty("id").GetGuid()}/pin", new { pin = KaisPin })).StatusCode);

        var members = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").EnumerateArray().ToList();
        Guid Membership(bool you) => members.Single(m => m.GetProperty("isYou").GetBoolean() == you).GetProperty("membershipId").GetGuid();
        return new TestFamily(dad, mom, familyId, kai.GetProperty("id").GetGuid(), Membership(true), Membership(false), dadEmail);
    }

    private sealed record TestFamily(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid DadMembershipId, Guid MomMembershipId, string DadEmail)
        : IDisposable
    {
        public string Path(string rest) => $"/api/families/{FamilyId}/{rest}";

        public void Dispose()
        {
            Dad.Dispose();
            Mom.Dispose();
        }
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
}
