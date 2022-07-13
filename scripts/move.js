class Move
{
    constructor(from, to, flags = 0, promo = 0)
    {
        this.move = ((flags & 0xf)<<12) | ((from & 0x3f)<<6) | (to & 0x3f) | ((promo & 0x3f)<<16);
    }
    
    getFrom()
    {
        return (this.move >> 6) & 0x3f;
    }

    getTo()
    {
        return this.move & 0x3f;
    }

    getFlags()
    {
        return (this.move >> 12) & 0x0f;
    }

    getPromotion()
    {
        return (this.move >> 16) & 0x3f;
    }

    from(_move)
    {
        this.move = _move.move | _move;
        return this;
    }
}