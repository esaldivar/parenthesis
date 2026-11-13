namespace CoParent.Modules.SharedRecords.Domain;

/// <summary>What a report belongs to: an agreed Shared Fund or a one-time Child Support record.</summary>
internal enum RecordKind
{
    Fund,
    Support,
}

/// <summary>Who received the money: a vendor (the other parent acknowledges it) or the other parent (they confirm receipt).</summary>
internal enum PaidTo
{
    Vendor,
    CoParent,
}

internal enum EntryStatus
{
    Pending,
    Acknowledged,
    Disputed,
}
