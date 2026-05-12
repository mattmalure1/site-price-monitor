"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ebay_listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ebay_item_id", sa.String(64), nullable=False, unique=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("url", sa.String(512), nullable=False),
        sa.Column("listing_type", sa.String(32), nullable=False),
        sa.Column("current_price", sa.Float(), nullable=False),
        sa.Column("shipping_price", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_price", sa.Float(), nullable=False),
        sa.Column("bid_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("seller_username", sa.String(128), nullable=False),
        sa.Column("seller_feedback_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seller_feedback_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("condition", sa.String(128), nullable=False, server_default=""),
        sa.Column("image_urls", postgresql.JSON(), nullable=False, server_default="[]"),
        sa.Column("has_authenticity_guarantee", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("return_policy", sa.String(256), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ebay_listings_ebay_item_id", "ebay_listings", ["ebay_item_id"])

    op.create_table(
        "pricecharting_products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pricecharting_id", sa.String(64), nullable=False, unique=True),
        sa.Column("product_name", sa.String(512), nullable=False),
        sa.Column("console_name", sa.String(128), nullable=False, server_default=""),
        sa.Column("set_name", sa.String(256), nullable=False, server_default=""),
        sa.Column("card_number", sa.String(32), nullable=False, server_default=""),
        sa.Column("loose_price", sa.Float(), nullable=True),
        sa.Column("grade_7_price", sa.Float(), nullable=True),
        sa.Column("grade_8_price", sa.Float(), nullable=True),
        sa.Column("grade_9_price", sa.Float(), nullable=True),
        sa.Column("psa_10_price", sa.Float(), nullable=True),
        sa.Column("cgc_10_price", sa.Float(), nullable=True),
        sa.Column("bgs_10_price", sa.Float(), nullable=True),
        sa.Column("sgc_10_price", sa.Float(), nullable=True),
        sa.Column("sales_volume", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pc_product_name", "pricecharting_products", ["product_name"])
    op.create_index("ix_pc_set_card", "pricecharting_products", ["set_name", "card_number"])

    op.create_table(
        "parsed_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("ebay_listings.id"), nullable=False, unique=True),
        sa.Column("game", sa.String(64), nullable=False, server_default="Pokemon"),
        sa.Column("card_name", sa.String(256), nullable=False, server_default=""),
        sa.Column("set_name", sa.String(256), nullable=False, server_default=""),
        sa.Column("card_number", sa.String(32), nullable=False, server_default=""),
        sa.Column("language", sa.String(32), nullable=False, server_default="English"),
        sa.Column("grader", sa.String(32), nullable=False, server_default=""),
        sa.Column("grade", sa.Float(), nullable=True),
        sa.Column("cert_number", sa.String(64), nullable=False, server_default=""),
        sa.Column("variant", sa.String(128), nullable=False, server_default=""),
        sa.Column("parse_confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("image_flags", postgresql.JSON(), nullable=False, server_default="[]"),
        sa.Column("risk_flags", postgresql.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "opportunities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("ebay_listings.id"), nullable=False, unique=True),
        sa.Column("matched_product_id", sa.Integer(), sa.ForeignKey("pricecharting_products.id"), nullable=True),
        sa.Column("market_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("resale_value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("fee_estimate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("shipping_out", sa.Float(), nullable=False, server_default="0"),
        sa.Column("supplies", sa.Float(), nullable=False, server_default="0"),
        sa.Column("risk_buffer", sa.Float(), nullable=False, server_default="0"),
        sa.Column("target_profit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_bid", sa.Float(), nullable=False, server_default="0"),
        sa.Column("expected_profit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("roi", sa.Float(), nullable=False, server_default="0"),
        sa.Column("profit_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("roi_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("liquidity_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("seller_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("timing_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("signal", sa.String(16), nullable=False, server_default="PASS"),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("alerted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_opportunities_signal", "opportunities", ["signal"])
    op.create_index("ix_opportunities_total_score", "opportunities", ["total_score"])

    op.create_table(
        "purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("listing_id", sa.Integer(), sa.ForeignKey("ebay_listings.id"), nullable=False, unique=True),
        sa.Column("opportunity_id", sa.Integer(), sa.ForeignKey("opportunities.id"), nullable=True),
        sa.Column("purchase_price", sa.Float(), nullable=False),
        sa.Column("shipping_paid", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Float(), nullable=False),
        sa.Column("won_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("listed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sale_price", sa.Float(), nullable=True),
        sa.Column("sale_platform", sa.String(64), nullable=False, server_default="eBay"),
        sa.Column("ebay_fees_paid", sa.Float(), nullable=True),
        sa.Column("net_profit", sa.Float(), nullable=True),
        sa.Column("days_to_sell", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending_receipt"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "blacklist_rules",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("rule_type", sa.String(32), nullable=False),
        sa.Column("value", sa.String(512), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("blacklist_rules")
    op.drop_table("purchases")
    op.drop_table("opportunities")
    op.drop_table("parsed_cards")
    op.drop_table("pricecharting_products")
    op.drop_table("ebay_listings")
