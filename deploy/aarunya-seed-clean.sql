--
-- PostgreSQL database dump
--

\restrict vOJg3e9b3erSY6AgAb1zXclmK2sYFtbpfIxl1L8QQMu3DwgdadqBSvil0Qkqfrk

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.variant DROP CONSTRAINT IF EXISTS variant_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.variant_image DROP CONSTRAINT IF EXISTS variant_image_variant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sub_category DROP CONSTRAINT IF EXISTS sub_category_category_slug_fkey;
ALTER TABLE IF EXISTS ONLY public.shipment DROP CONSTRAINT IF EXISTS shipment_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_request DROP CONSTRAINT IF EXISTS return_request_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.return_history DROP CONSTRAINT IF EXISTS return_history_return_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product_spec DROP CONSTRAINT IF EXISTS product_spec_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_category_slug_fkey;
ALTER TABLE IF EXISTS ONLY public.password_reset_token DROP CONSTRAINT IF EXISTS password_reset_token_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_item DROP CONSTRAINT IF EXISTS order_item_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.order_history DROP CONSTRAINT IF EXISTS order_history_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.category_pairing DROP CONSTRAINT IF EXISTS category_pairing_category_slug_fkey;
DROP INDEX IF EXISTS public.variant_product_id_idx;
DROP INDEX IF EXISTS public.stock_ledger_variant_id_at_idx;
DROP INDEX IF EXISTS public.stock_ledger_at_idx;
DROP INDEX IF EXISTS public.return_request_status_idx;
DROP INDEX IF EXISTS public.return_request_order_id_idx;
DROP INDEX IF EXISTS public.return_history_return_id_at_idx;
DROP INDEX IF EXISTS public.product_status_idx;
DROP INDEX IF EXISTS public.product_spec_product_id_idx;
DROP INDEX IF EXISTS public.product_category_slug_idx;
DROP INDEX IF EXISTS public.password_reset_token_user_id_idx;
DROP INDEX IF EXISTS public.order_item_order_id_idx;
DROP INDEX IF EXISTS public.order_history_order_id_at_idx;
DROP INDEX IF EXISTS public.order_cust_phone_idx;
DROP INDEX IF EXISTS public.order_created_at_idx;
DROP INDEX IF EXISTS public.order_channel_status_idx;
DROP INDEX IF EXISTS public.order_access_token_idx;
DROP INDEX IF EXISTS public.login_attempt_ip_at_idx;
DROP INDEX IF EXISTS public.login_attempt_email_at_idx;
DROP INDEX IF EXISTS public.contact_message_created_at_idx;
ALTER TABLE IF EXISTS ONLY public.variant DROP CONSTRAINT IF EXISTS variant_product_id_color_key_key;
ALTER TABLE IF EXISTS ONLY public.variant DROP CONSTRAINT IF EXISTS variant_pkey;
ALTER TABLE IF EXISTS ONLY public.variant_image DROP CONSTRAINT IF EXISTS variant_image_pkey;
ALTER TABLE IF EXISTS ONLY public.sub_category DROP CONSTRAINT IF EXISTS sub_category_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_pkey;
ALTER TABLE IF EXISTS ONLY public.shipment DROP CONSTRAINT IF EXISTS shipment_pkey;
ALTER TABLE IF EXISTS ONLY public.setting DROP CONSTRAINT IF EXISTS setting_pkey;
ALTER TABLE IF EXISTS ONLY public.return_request DROP CONSTRAINT IF EXISTS return_request_pkey;
ALTER TABLE IF EXISTS ONLY public.return_history DROP CONSTRAINT IF EXISTS return_history_pkey;
ALTER TABLE IF EXISTS ONLY public.product_spec DROP CONSTRAINT IF EXISTS product_spec_pkey;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_slug_key;
ALTER TABLE IF EXISTS ONLY public.product DROP CONSTRAINT IF EXISTS product_pkey;
ALTER TABLE IF EXISTS ONLY public.password_reset_token DROP CONSTRAINT IF EXISTS password_reset_token_pkey;
ALTER TABLE IF EXISTS ONLY public."order" DROP CONSTRAINT IF EXISTS order_pkey;
ALTER TABLE IF EXISTS ONLY public.order_item DROP CONSTRAINT IF EXISTS order_item_pkey;
ALTER TABLE IF EXISTS ONLY public.order_history DROP CONSTRAINT IF EXISTS order_history_pkey;
ALTER TABLE IF EXISTS ONLY public.offer DROP CONSTRAINT IF EXISTS offer_pkey;
ALTER TABLE IF EXISTS ONLY public.login_attempt DROP CONSTRAINT IF EXISTS login_attempt_pkey;
ALTER TABLE IF EXISTS ONLY public.contact_message DROP CONSTRAINT IF EXISTS contact_message_pkey;
ALTER TABLE IF EXISTS ONLY public.color DROP CONSTRAINT IF EXISTS color_pkey;
ALTER TABLE IF EXISTS ONLY public.category DROP CONSTRAINT IF EXISTS category_pkey;
ALTER TABLE IF EXISTS ONLY public.category_pairing DROP CONSTRAINT IF EXISTS category_pairing_pkey;
ALTER TABLE IF EXISTS ONLY public.banner DROP CONSTRAINT IF EXISTS banner_pkey;
ALTER TABLE IF EXISTS ONLY public.app_user DROP CONSTRAINT IF EXISTS app_user_pkey;
ALTER TABLE IF EXISTS ONLY public.app_user DROP CONSTRAINT IF EXISTS app_user_email_key;
ALTER TABLE IF EXISTS ONLY public.announcement DROP CONSTRAINT IF EXISTS announcement_pkey;
ALTER TABLE IF EXISTS public.stock_ledger ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.return_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.product_spec ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.password_reset_token ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.order_item ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.order_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.offer ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.login_attempt ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.contact_message ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.app_user ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.announcement ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.variant_image;
DROP TABLE IF EXISTS public.variant;
DROP TABLE IF EXISTS public.sub_category;
DROP SEQUENCE IF EXISTS public.stock_ledger_id_seq;
DROP TABLE IF EXISTS public.stock_ledger;
DROP TABLE IF EXISTS public.shipment;
DROP TABLE IF EXISTS public.setting;
DROP TABLE IF EXISTS public.return_request;
DROP SEQUENCE IF EXISTS public.return_history_id_seq;
DROP TABLE IF EXISTS public.return_history;
DROP SEQUENCE IF EXISTS public.product_spec_id_seq;
DROP TABLE IF EXISTS public.product_spec;
DROP TABLE IF EXISTS public.product;
DROP SEQUENCE IF EXISTS public.password_reset_token_id_seq;
DROP TABLE IF EXISTS public.password_reset_token;
DROP SEQUENCE IF EXISTS public.order_item_id_seq;
DROP TABLE IF EXISTS public.order_item;
DROP SEQUENCE IF EXISTS public.order_history_id_seq;
DROP TABLE IF EXISTS public.order_history;
DROP TABLE IF EXISTS public."order";
DROP SEQUENCE IF EXISTS public.offer_id_seq;
DROP TABLE IF EXISTS public.offer;
DROP SEQUENCE IF EXISTS public.login_attempt_id_seq;
DROP TABLE IF EXISTS public.login_attempt;
DROP SEQUENCE IF EXISTS public.contact_message_id_seq;
DROP TABLE IF EXISTS public.contact_message;
DROP TABLE IF EXISTS public.color;
DROP TABLE IF EXISTS public.category_pairing;
DROP TABLE IF EXISTS public.category;
DROP TABLE IF EXISTS public.banner;
DROP SEQUENCE IF EXISTS public.app_user_id_seq;
DROP TABLE IF EXISTS public.app_user;
DROP SEQUENCE IF EXISTS public.announcement_id_seq;
DROP TABLE IF EXISTS public.announcement;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.sales_channel;
DROP TYPE IF EXISTS public.return_type;
DROP TYPE IF EXISTS public.return_status;
DROP TYPE IF EXISTS public.product_status;
DROP TYPE IF EXISTS public.payment_status;
DROP TYPE IF EXISTS public.order_status;
DROP TYPE IF EXISTS public.ledger_reason;
-- *not* dropping schema, since initdb creates it
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: ledger_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ledger_reason AS ENUM (
    'online',
    'offline',
    'cancel',
    'return',
    'replacement',
    'adjust'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'new',
    'packed',
    'shipped',
    'out',
    'delivered',
    'cancelled',
    'completed'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'paid',
    'pending',
    'refunded',
    'partial'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'active',
    'draft'
);


--
-- Name: return_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_status AS ENUM (
    'requested',
    'approved',
    'pickup',
    'received',
    'completed',
    'rejected'
);


--
-- Name: return_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.return_type AS ENUM (
    'replacement',
    'refund'
);


--
-- Name: sales_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sales_channel AS ENUM (
    'online',
    'offline'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'user'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement (
    id bigint NOT NULL,
    text text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: announcement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.announcement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: announcement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.announcement_id_seq OWNED BY public.announcement.id;


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id bigint NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    password_hash text NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_user_id_seq OWNED BY public.app_user.id;


--
-- Name: banner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banner (
    id integer DEFAULT 1 NOT NULL,
    hero_desktop text DEFAULT ''::text NOT NULL,
    hero_mobile text DEFAULT ''::text NOT NULL,
    hero_alt text DEFAULT ''::text NOT NULL,
    personalised text DEFAULT ''::text NOT NULL,
    personalised_mobile text DEFAULT ''::text NOT NULL,
    personalised_alt text DEFAULT ''::text NOT NULL,
    personalised_cta text DEFAULT ''::text NOT NULL,
    CONSTRAINT banner_id_check CHECK ((id = 1))
);


--
-- Name: category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category (
    slug text NOT NULL,
    name text NOT NULL,
    short text DEFAULT ''::text NOT NULL,
    ph text DEFAULT ''::text NOT NULL,
    tint text DEFAULT ''::text NOT NULL,
    image text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: category_pairing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_pairing (
    category_slug text NOT NULL,
    paired_slug text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: color; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.color (
    key text NOT NULL,
    label text NOT NULL,
    hex text NOT NULL,
    tint text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: contact_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_message (
    id bigint NOT NULL,
    name text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    order_no text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    message text NOT NULL,
    ip text DEFAULT ''::text NOT NULL,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_message_id_seq OWNED BY public.contact_message.id;


--
-- Name: login_attempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempt (
    id bigint NOT NULL,
    email text NOT NULL,
    ip text NOT NULL,
    ok boolean NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_attempt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_attempt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_attempt_id_seq OWNED BY public.login_attempt.id;


--
-- Name: offer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer (
    id bigint NOT NULL,
    badge text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    accent text DEFAULT ''::text NOT NULL,
    sub text DEFAULT ''::text NOT NULL,
    cta text DEFAULT ''::text NOT NULL,
    href text DEFAULT ''::text NOT NULL,
    match_key text DEFAULT 'sale'::text NOT NULL,
    image text DEFAULT ''::text NOT NULL,
    w integer DEFAULT 0 NOT NULL,
    btn text DEFAULT 'solid'::text NOT NULL,
    bx numeric DEFAULT 50 NOT NULL,
    by numeric DEFAULT 50 NOT NULL,
    alt text DEFAULT ''::text NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: offer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offer_id_seq OWNED BY public.offer.id;


--
-- Name: order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."order" (
    id text NOT NULL,
    channel public.sales_channel NOT NULL,
    status public.order_status DEFAULT 'new'::public.order_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cust_name text DEFAULT ''::text NOT NULL,
    cust_phone text DEFAULT ''::text NOT NULL,
    cust_email text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    state text DEFAULT ''::text NOT NULL,
    pin text DEFAULT ''::text NOT NULL,
    subtotal integer DEFAULT 0 NOT NULL,
    shipping integer DEFAULT 0 NOT NULL,
    gift_wrap boolean DEFAULT false NOT NULL,
    gift_fee integer DEFAULT 0 NOT NULL,
    discount integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    pay_status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    pay_method text DEFAULT ''::text NOT NULL,
    provider text,
    pay_ref text,
    location text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    return_id text,
    access_token text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_history (
    id bigint NOT NULL,
    order_id text NOT NULL,
    status text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_history_id_seq OWNED BY public.order_history.id;


--
-- Name: order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_item (
    id bigint NOT NULL,
    order_id text NOT NULL,
    product_id text,
    variant_id text,
    name text NOT NULL,
    color_key text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    qty integer NOT NULL,
    price integer NOT NULL,
    img text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT order_item_price_check CHECK ((price >= 0)),
    CONSTRAINT order_item_qty_check CHECK ((qty > 0))
);


--
-- Name: order_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_item_id_seq OWNED BY public.order_item.id;


--
-- Name: password_reset_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_token (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_reset_token_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_token_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_token_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_token_id_seq OWNED BY public.password_reset_token.id;


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    category_slug text NOT NULL,
    sub_slug text,
    popularity integer DEFAULT 0 NOT NULL,
    price integer NOT NULL,
    mrp integer NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    is_new boolean DEFAULT false NOT NULL,
    created_at_ymd text DEFAULT ''::text NOT NULL,
    rating numeric(2,1),
    review_count integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    material text DEFAULT ''::text NOT NULL,
    status public.product_status DEFAULT 'active'::public.product_status NOT NULL,
    gift_wrap boolean DEFAULT true NOT NULL,
    exchange boolean DEFAULT true NOT NULL,
    seo_title text DEFAULT ''::text NOT NULL,
    seo_desc text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_mrp_check CHECK ((mrp >= 0)),
    CONSTRAINT product_price_check CHECK ((price >= 0))
);


--
-- Name: product_spec; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_spec (
    id bigint NOT NULL,
    product_id text NOT NULL,
    k text NOT NULL,
    v text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: product_spec_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_spec_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_spec_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_spec_id_seq OWNED BY public.product_spec.id;


--
-- Name: return_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_history (
    id bigint NOT NULL,
    return_id text NOT NULL,
    status text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: return_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.return_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: return_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.return_history_id_seq OWNED BY public.return_history.id;


--
-- Name: return_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_request (
    id text NOT NULL,
    order_id text NOT NULL,
    cust_name text DEFAULT ''::text NOT NULL,
    cust_phone text DEFAULT ''::text NOT NULL,
    item_pid text DEFAULT ''::text NOT NULL,
    item_vid text DEFAULT ''::text NOT NULL,
    item_name text DEFAULT ''::text NOT NULL,
    item_color text DEFAULT ''::text NOT NULL,
    item_sku text DEFAULT ''::text NOT NULL,
    item_qty integer DEFAULT 1 NOT NULL,
    item_price integer DEFAULT 0 NOT NULL,
    item_img text DEFAULT ''::text NOT NULL,
    type public.return_type NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    video boolean DEFAULT false NOT NULL,
    photos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    status public.return_status DEFAULT 'requested'::public.return_status NOT NULL,
    resolution text DEFAULT ''::text NOT NULL,
    restocked boolean,
    pickup_courier text,
    pickup_date text,
    refund_amount integer,
    refund_method text
);


--
-- Name: setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.setting (
    key text NOT NULL,
    value jsonb NOT NULL
);


--
-- Name: shipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment (
    order_id text NOT NULL,
    courier text DEFAULT ''::text NOT NULL,
    awb text DEFAULT ''::text NOT NULL,
    shipped_at timestamp with time zone
);


--
-- Name: stock_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_ledger (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    product_id text DEFAULT ''::text NOT NULL,
    variant_id text DEFAULT ''::text NOT NULL,
    sku text DEFAULT ''::text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    color_key text DEFAULT ''::text NOT NULL,
    change integer NOT NULL,
    reason public.ledger_reason NOT NULL,
    ref text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL
);


--
-- Name: stock_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_ledger_id_seq OWNED BY public.stock_ledger.id;


--
-- Name: sub_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_category (
    category_slug text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: variant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant (
    id text NOT NULL,
    product_id text NOT NULL,
    color_key text NOT NULL,
    sku text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT variant_stock_check CHECK ((stock >= 0))
);


--
-- Name: variant_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_image (
    variant_id text NOT NULL,
    slot smallint NOT NULL,
    url text NOT NULL,
    CONSTRAINT variant_image_slot_check CHECK (((slot >= 0) AND (slot <= 2)))
);


--
-- Name: announcement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement ALTER COLUMN id SET DEFAULT nextval('public.announcement_id_seq'::regclass);


--
-- Name: app_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user ALTER COLUMN id SET DEFAULT nextval('public.app_user_id_seq'::regclass);


--
-- Name: contact_message id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_message ALTER COLUMN id SET DEFAULT nextval('public.contact_message_id_seq'::regclass);


--
-- Name: login_attempt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempt ALTER COLUMN id SET DEFAULT nextval('public.login_attempt_id_seq'::regclass);


--
-- Name: offer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer ALTER COLUMN id SET DEFAULT nextval('public.offer_id_seq'::regclass);


--
-- Name: order_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history ALTER COLUMN id SET DEFAULT nextval('public.order_history_id_seq'::regclass);


--
-- Name: order_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item ALTER COLUMN id SET DEFAULT nextval('public.order_item_id_seq'::regclass);


--
-- Name: password_reset_token id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token ALTER COLUMN id SET DEFAULT nextval('public.password_reset_token_id_seq'::regclass);


--
-- Name: product_spec id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_spec ALTER COLUMN id SET DEFAULT nextval('public.product_spec_id_seq'::regclass);


--
-- Name: return_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_history ALTER COLUMN id SET DEFAULT nextval('public.return_history_id_seq'::regclass);


--
-- Name: stock_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger ALTER COLUMN id SET DEFAULT nextval('public.stock_ledger_id_seq'::regclass);


--
-- Data for Name: announcement; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.announcement (id, text, sort_order) FROM stdin;
1	Free shipping on orders above ₹499	0
2	Pan-India delivery	1
3	Easy 3-day returns	2
4	Order before 4 PM for same-day dispatch	3
5	Handpicked in Kerala by Veena	4
\.


--
-- Data for Name: banner; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.banner (id, hero_desktop, hero_mobile, hero_alt, personalised, personalised_mobile, personalised_alt, personalised_cta) FROM stdin;
1							
\.


--
-- Data for Name: category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.category (slug, name, short, ph, tint, image, sort_order) FROM stdin;
bangles	Bangles	Bangles	bangles	#F7E4E4	/uploads/category/2026/10/category-e13c36fe.jpg	1
earrings	Earrings	Earrings	earrings	#F5ECDD	/uploads/category/2026/10/category-81d53e6d.jpg	2
nose-rings	Nose Rings	Nose Rings	nose rings	#F5ECDD	/uploads/category/2026/10/category-7976e9b1.jpg	3
bracelets	Bracelets	Bracelets	bracelets	#F5ECDD	/uploads/category/2026/10/bracelets-d344ad8d.jpg	4
hand-chains	Hand Chains	Hand Chains	hand chains	#F5ECDD	/uploads/category/2026/10/hand-chains-d0b66794.jpg	5
rings	Rings	Rings	rings	#F5ECDD	/uploads/category/2026/10/rings-949ff8a5.jpg	6
hip-chains	Hip Chains	Hip Chains	hip chains	#F5ECDD	/uploads/category/2026/10/category-99d9b194.jpg	7
anklets	Anklets	Anklets	anklets	#F5ECDD	/uploads/category/2026/10/anklets-c230c626.jpg	8
anti-tarnish	Anti-Tarnish Jewellery	Anti-Tarnish	anti-tarnish	#F5ECDD	/uploads/category/2026/10/anti-tarnish-jewellery-0c909465.jpg	9
necklaces	Anti-Tarnish Necklaces	Necklaces	necklaces	#F7E4E4	/uploads/category/2026/10/anti-tarnish-necklaces-02f0bf91.jpg	0
\.


--
-- Data for Name: category_pairing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.category_pairing (category_slug, paired_slug, sort_order) FROM stdin;
earrings	necklaces	0
nose-rings	earrings	0
rings	hand-chains	0
\.


--
-- Data for Name: color; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.color (key, label, hex, tint, sort_order) FROM stdin;
\.


--
-- Data for Name: offer; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.offer (id, badge, title, accent, sub, cta, href, match_key, image, w, btn, bx, by, alt, hidden, sort_order) FROM stdin;
\.


--
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product (id, slug, name, category_slug, sub_slug, popularity, price, mrp, featured, is_new, created_at_ymd, rating, review_count, description, material, status, gift_wrap, exchange, seo_title, seo_desc, created_at, updated_at) FROM stdin;
pmvlboffa	gold-pearl-drop-necklace	Gold Pearl Drop Necklace	necklaces	pearl-necklaces	0	399	399	f	t	2026-10-24	\N	0	A refined gold-tone necklace with seven delicate white pearl-like drops suspended along a fine chain. A timeless, feminine style suited to elegant everyday outfits and special moments.		active	f	t			2026-10-23 18:47:47.733448+00	2026-10-25 04:32:17.134513+00
pmvlzwak9	sleek-snake-chain-hipchain	Sleek Snake Chain Hipchain	hip-chains	\N	0	599	699	f	t	2026-10-24	\N	0	A sleek snake-chain style gold hipchain with a clean modern look. Minimal, elegant and perfect for styling with sarees, skirts or western outfits.	Stainless steel base with anti-tarnish gold plating	active	t	t			2026-10-24 06:05:45.466347+00	2026-10-25 04:32:17.121054+00
pmvlzwajk	ruby-leaf-anklet	Ruby Leaf Anklet	anklets	\N	0	399	499	f	t	2026-10-24	\N	0	A charming gold anklet decorated with ruby-red leaf motifs, green accents and tiny gold bead details. Light, graceful and ideal for festive or casual wear.	Stainless steel base with anti-tarnish gold plating, coloured stone accents	active	t	t			2026-10-24 06:05:45.441219+00	2026-10-25 04:32:17.105331+00
pmvlzwaiw	heart-shine-ring	Heart Shine Ring	rings	\N	0	349	449	f	t	2026-10-24	\N	0	A slim gold ring with a heart-shaped stone cluster at the centre. Sweet, feminine and perfect for stacking or wearing alone.	Stainless steel base with anti-tarnish gold plating, zircon stones	active	t	t			2026-10-24 06:05:45.41642+00	2026-10-25 04:32:17.088447+00
pmvlzwaia	infinity-spark-ring	Infinity Spark Ring	rings	\N	0	329	429	f	t	2026-10-24	\N	0	A delicate gold ring featuring an infinity motif with sparkling stone detailing. A graceful piece symbolising forever love and timeless style.	Stainless steel base with anti-tarnish gold plating, zircon stones	active	t	t			2026-10-24 06:05:45.395165+00	2026-10-25 04:32:17.075351+00
pmvlzwagr	evil-eye-cable-bangle	Evil Eye Cable Bangle	bangles	\N	0	579	699	f	t	2026-10-24	\N	0	A sleek cable-style gold bangle finished with blue evil-eye charms and crystal spacer details. Elegant, minimal and easy to wear every day.	Stainless steel base with anti-tarnish gold plating, crystal accents	active	t	t			2026-10-24 06:05:45.341987+00	2026-10-25 04:32:17.06296+00
pmvnas322	gold-classic-hoop-earrings	Gold Classic Hoop Earrings	earrings	\N	0	329	329	f	f	2026-10-25	\N	0	Plain round hoops, mid size. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:11.067057+00	2026-10-25 10:22:02.760229+00
pmvjwdzu6	gold-seven-heart-charm-necklace	Gold Seven-Heart Charm Necklace	necklaces	\N	0	299	299	f	f	2026-10-23	\N	0	A delicate gold-tone necklace featuring seven dangling heart charms arranged along a fine chain. Its romantic, minimalist design adds a charming finishing touch to everyday outfits and special occasions.		active	t	t			2026-10-22 18:58:33.994999+00	2026-10-24 06:21:00.355589+00
pmvnas34d	gold-stone-nose-stud	Gold Stone Nose Stud	nose-rings	stone-nose-rings	0	309	309	f	f	2026-10-25	\N	0	A single small stone on a stud. A gold-tone piece for everyday wear and gifting.	Gold-tone metal, stone-accented	active	f	t			2026-10-25 03:58:11.149636+00	2026-10-25 04:04:50.635671+00
pmvnas33v	gold-stone-nose-hoop	Gold Stone Nose Hoop	nose-rings	\N	0	299	299	f	f	2026-10-25	\N	0	A row of small stones along a fine hoop. A gold-tone piece for everyday wear and gifting.	Gold-tone metal, stone-accented	active	f	t			2026-10-25 03:58:11.131364+00	2026-10-25 04:04:50.654511+00
pmvnas33h	gold-marquise-pearl-drop-earrings	Gold Marquise Pearl Drop Earrings	earrings	\N	0	359	359	f	f	2026-10-25	\N	0	Marquise stones above a single pearl drop. A gold-tone piece for everyday wear and gifting.	Gold-tone metal with faux pearl and stone accents	active	f	t			2026-10-25 03:58:11.117037+00	2026-10-25 04:04:50.67428+00
pmvnas32h	gold-floral-stud-earrings	Gold Floral Stud Earrings	earrings	stud-earrings	0	299	299	f	f	2026-10-25	\N	0	A seven-stone flower on each stud. A gold-tone piece for everyday wear and gifting.	Gold-tone metal, stone-accented	active	f	t			2026-10-25 03:58:11.081667+00	2026-10-25 04:04:50.710179+00
pmvnas30s	gold-double-layer-anklet	Gold Double Layer Anklet	anklets	minimal-anklets	0	389	389	f	f	2026-10-25	\N	0	Two chains worn together on one clasp. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:11.020413+00	2026-10-25 04:04:50.727836+00
pmvnas309	gold-star-charm-anklet	Gold Star Charm Anklet	anklets	charm-anklets	0	359	359	f	f	2026-10-25	\N	0	Small star charms along the chain. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:11.0014+00	2026-10-25 04:04:50.744644+00
pmvnas2zr	gold-bead-chain-anklet	Gold Bead Chain Anklet	anklets	minimal-anklets	0	329	329	f	f	2026-10-25	\N	0	Fine chain with small round beads. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.983841+00	2026-10-25 04:04:50.761968+00
pmvnas2yu	gold-layered-hip-chain	Gold Layered Hip Chain	hip-chains	minimal-hip-chains	0	649	649	f	f	2026-10-25	\N	0	Two chains of different lengths worn as one. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.951457+00	2026-10-25 04:04:50.799199+00
pmvnas2yc	gold-beaded-waist-chain	Gold Beaded Waist Chain	hip-chains	minimal-hip-chains	0	569	569	f	f	2026-10-25	\N	0	Fine chain with evenly spaced beads. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.93192+00	2026-10-25 04:04:50.81748+00
pmvnas2xo	gold-twisted-rope-bangle	Gold Twisted Rope Bangle	bangles	classic-bangles	0	549	549	f	f	2026-10-25	\N	0	A rope-twist bangle with a smooth finish. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.909078+00	2026-10-25 04:04:50.836388+00
pmvnas2v7	gold-twist-band-ring	Gold Twist Band Ring	rings	minimal-rings	0	299	299	f	f	2026-10-25	\N	0	A slim band with a single twist at the front. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.825603+00	2026-10-25 04:04:50.877688+00
pmvnas2wr	gold-solitaire-sparkle-ring	Gold Solitaire Sparkle Ring	rings	stone-rings	0	339	339	t	f	2026-10-25	\N	0	One round stone raised on a fine band. A gold-tone piece for everyday wear and gifting.	Gold-tone metal, stone-accented	active	f	t			2026-10-25 03:58:10.876447+00	2026-10-25 04:32:16.989476+00
pmvnas2zb	gold-coin-charm-hip-chain	Gold Coin Charm Hip Chain	hip-chains	charm-hip-chains	0	619	619	t	f	2026-10-25	\N	0	Small flat coin charms along the chain. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:10.967249+00	2026-10-25 04:32:17.005349+00
pmvnas32z	gold-floral-jhumka-earrings	Gold Floral Jhumka Earrings	earrings	jhumkas	0	499	499	t	f	2026-10-25	\N	0	A flower top with a fluted jhumka bell. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:11.099321+00	2026-10-25 04:32:17.018498+00
pmvlbofen	gold-clover-charm-necklace	Gold Clover Charm Necklace	necklaces	charm-necklaces	0	349	349	f	t	2026-10-24	\N	0	A delicate gold-tone necklace featuring five charming clover motifs spaced along a fine chain. A graceful everyday accessory that adds a subtle botanical touch to casual and occasion outfits.		active	f	t			2026-10-23 18:47:47.711682+00	2026-10-25 04:32:17.032805+00
pmvnas359	gold-cluster-nose-hoop	Gold Cluster Nose Hoop	nose-rings	\N	0	349	349	f	f	2026-10-25	\N	0	A three-stone cluster on a fine ball-end hoop. A gold-tone piece for everyday wear and gifting.	Gold-tone metal, stone-accented	active	f	t			2026-10-25 03:58:11.181008+00	2026-10-25 04:04:50.583307+00
pmvnas34v	gold-floral-nose-pin	Gold Floral Nose Pin	nose-rings	nose-studs	0	329	329	f	f	2026-10-25	\N	0	A small flower head on a pin. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 03:58:11.167293+00	2026-10-25 04:04:50.61636+00
pmvnb7p6m	gold-minimal-hand-chain	Gold Minimal Hand Chain	hand-chains	minimal-hand-chains	0	429	429	f	f	2026-10-25	\N	0	A plain chain from ring to wrist. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 04:10:19.583776+00	2026-10-25 04:10:19.812483+00
pmvnb7p66	gold-slim-cuff-bracelet	Gold Slim Cuff Bracelet	bracelets	cuff-bracelets	0	489	489	f	f	2026-10-25	\N	0	A narrow open cuff, plain. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 04:10:19.566806+00	2026-10-25 04:10:19.829586+00
pmvnb7p5m	gold-pearl-station-bracelet	Gold Pearl Station Bracelet	bracelets	chain-bracelets	0	469	469	t	f	2026-10-25	\N	0	Faux pearls set at intervals along the chain. A gold-tone piece for everyday wear and gifting.	Gold-tone metal with faux pearl accents	active	f	t			2026-10-25 04:10:19.546779+00	2026-10-25 04:32:16.954268+00
pmvnb7p73	gold-floral-hand-harness	Gold Floral Hand Harness	hand-chains	floral-hand-chains	0	549	549	t	f	2026-10-25	\N	0	A flower at the back of the hand. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 04:10:19.599663+00	2026-10-25 04:32:16.975171+00
pmvlboffm	gold-star-charm-necklace	Gold Star Charm Necklace	necklaces	charm-necklaces	0	299	299	f	t	2026-10-24	\N	0	A dainty gold-tone necklace featuring seven small dangling star charms along a delicate chain. A playful yet elegant design that complements relaxed everyday styling and thoughtful gifting.		active	f	t			2026-10-23 18:47:47.74469+00	2026-10-25 04:32:17.045425+00
pmvnb7p4w	gold-heart-station-bracelet	Gold Heart Station Bracelet	bracelets	chain-bracelets	0	429	429	f	f	2026-10-25	\N	0	Small hearts spaced along a fine chain. A gold-tone piece for everyday wear and gifting.	Gold-tone metal	active	f	t			2026-10-25 04:10:19.523609+00	2026-10-25 10:22:02.738663+00
\.


--
-- Data for Name: product_spec; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_spec (id, product_id, k, v, sort_order) FROM stdin;
191	pmvnb7p5m	Finish	Gold-tone	0
192	pmvnb7p5m	Style	Faux pearls set at intervals along the chain	1
193	pmvnb7p5m	Occasion	Daily wear / gifting	2
194	pmvnb7p73	Finish	Gold-tone	0
195	pmvnb7p73	Style	A flower at the back of the hand	1
196	pmvnb7p73	Occasion	Daily wear / gifting	2
197	pmvnas2wr	Finish	Gold-tone	0
198	pmvnas2wr	Style	One round stone raised on a fine band	1
199	pmvnas2wr	Occasion	Daily wear / gifting	2
200	pmvnas2zb	Finish	Gold-tone	0
201	pmvnas2zb	Style	Small flat coin charms along the chain	1
202	pmvnas2zb	Occasion	Daily wear / gifting	2
203	pmvnas32z	Finish	Gold-tone	0
204	pmvnas32z	Style	A flower top with a fluted jhumka bell	1
58	pmvjwdzu6	Finish	Anti-tarnish, nickel-free	0
205	pmvnas32z	Occasion	Daily wear / gifting	2
206	pmvlbofen	Style	Clover Charm Necklace	0
207	pmvlbofen	Design	Five Clover Charms	1
208	pmvlbofen	Colour	Gold	2
209	pmvlbofen	Occasion	Everyday / Gifting	3
210	pmvlboffm	Style	Star Charm Necklace	0
211	pmvlboffm	Design	Seven Star Charms	1
212	pmvlboffm	Colour	Gold	2
213	pmvlboffm	Occasion	Everyday / Gifting	3
214	pmvlzwagr	Finish	Anti-tarnish, nickel-free	0
215	pmvlzwagr	Style	Minimal statement bangle	1
216	pmvlzwagr	Occasion	Daily wear / gifting	2
217	pmvlzwaia	Finish	Anti-tarnish, nickel-free	0
218	pmvlzwaia	Style	Minimal ring	1
219	pmvlzwaia	Occasion	Daily wear / gifting	2
220	pmvlzwaiw	Finish	Anti-tarnish, nickel-free	0
221	pmvlzwaiw	Style	Dainty heart ring	1
222	pmvlzwaiw	Occasion	Daily wear / gifting	2
223	pmvlzwajk	Finish	Anti-tarnish, nickel-free	0
224	pmvlzwajk	Style	Delicate charm anklet	1
225	pmvlzwajk	Occasion	Daily wear / festive wear	2
226	pmvlzwak9	Finish	Anti-tarnish, nickel-free	0
227	pmvlzwak9	Style	Minimal waist chain	1
228	pmvlzwak9	Occasion	Festive wear / styling accessory	2
229	pmvlboffa	Style	Pearl Drop Necklace	0
230	pmvlboffa	Design	Seven Pearl-Like Drops	1
231	pmvlboffa	Colour	Gold / White	2
232	pmvlboffa	Occasion	Everyday / Special Occasions	3
239	pmvnb7p4w	Finish	Gold-tone	0
240	pmvnb7p4w	Style	Small hearts spaced along a fine chain	1
241	pmvnb7p4w	Occasion	Daily wear / gifting	2
242	pmvnas322	Finish	Gold-tone	0
243	pmvnas322	Style	Plain round hoops, mid size	1
244	pmvnas322	Occasion	Daily wear / gifting	2
110	pmvnas359	Finish	Gold-tone	0
111	pmvnas359	Style	A three-stone cluster on a fine ball-end hoop	1
112	pmvnas359	Occasion	Daily wear / gifting	2
113	pmvnas34v	Finish	Gold-tone	0
114	pmvnas34v	Style	A small flower head on a pin	1
115	pmvnas34v	Occasion	Daily wear / gifting	2
116	pmvnas34d	Finish	Gold-tone	0
117	pmvnas34d	Style	A single small stone on a stud	1
118	pmvnas34d	Occasion	Daily wear / gifting	2
119	pmvnas33v	Finish	Gold-tone	0
120	pmvnas33v	Style	A row of small stones along a fine hoop	1
121	pmvnas33v	Occasion	Daily wear / gifting	2
122	pmvnas33h	Finish	Gold-tone	0
123	pmvnas33h	Style	Marquise stones above a single pearl drop	1
124	pmvnas33h	Occasion	Daily wear / gifting	2
128	pmvnas32h	Finish	Gold-tone	0
129	pmvnas32h	Style	A seven-stone flower on each stud	1
130	pmvnas32h	Occasion	Daily wear / gifting	2
131	pmvnas30s	Finish	Gold-tone	0
132	pmvnas30s	Style	Two chains worn together on one clasp	1
133	pmvnas30s	Occasion	Daily wear / gifting	2
134	pmvnas309	Finish	Gold-tone	0
135	pmvnas309	Style	Small star charms along the chain	1
136	pmvnas309	Occasion	Daily wear / gifting	2
137	pmvnas2zr	Finish	Gold-tone	0
138	pmvnas2zr	Style	Fine chain with small round beads	1
139	pmvnas2zr	Occasion	Daily wear / gifting	2
143	pmvnas2yu	Finish	Gold-tone	0
144	pmvnas2yu	Style	Two chains of different lengths worn as one	1
145	pmvnas2yu	Occasion	Daily wear / gifting	2
146	pmvnas2yc	Finish	Gold-tone	0
147	pmvnas2yc	Style	Fine chain with evenly spaced beads	1
148	pmvnas2yc	Occasion	Daily wear / gifting	2
149	pmvnas2xo	Finish	Gold-tone	0
150	pmvnas2xo	Style	A rope-twist bangle with a smooth finish	1
151	pmvnas2xo	Occasion	Daily wear / gifting	2
155	pmvnas2v7	Finish	Gold-tone	0
156	pmvnas2v7	Style	A slim band with a single twist at the front	1
157	pmvnas2v7	Occasion	Daily wear / gifting	2
179	pmvnb7p6m	Finish	Gold-tone	0
180	pmvnb7p6m	Style	A plain chain from ring to wrist	1
181	pmvnb7p6m	Occasion	Daily wear / gifting	2
182	pmvnb7p66	Finish	Gold-tone	0
183	pmvnb7p66	Style	A narrow open cuff, plain	1
184	pmvnb7p66	Occasion	Daily wear / gifting	2
\.


--
-- Data for Name: setting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.setting (key, value) FROM stdin;
config	{"EMAIL": "Aarunyajewelsbyveena@gmail.com", "shipMsg": "Hi {name}, your Aarunya order {order} has shipped. Track it here: {link}", "couriers": [{"id": "shiprocket", "url": "https://shiprocket.co/tracking/{awb}", "name": "Shiprocket"}, {"id": "delhivery", "url": "https://www.delhivery.com/track/package/{awb}", "name": "Delhivery"}, {"id": "dtdc", "url": "https://www.dtdc.in/tracking.asp?awb={awb}", "name": "DTDC"}, {"id": "indiapost", "url": "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?awb={awb}", "name": "India Post (Speed Post)"}], "LOW_STOCK": 2, "locations": [], "allowRefund": true, "nonEligible": [], "SHIPPING_FEE": 60, "notifyOnShip": true, "requireVideo": true, "returnWindow": 3, "DELIVERY_DAYS": {"rest": [4, 7], "local": [2, 3]}, "GIFT_WRAP_FEE": 49, "WHATSAPP_TEXT": "Hi Aarunya Jewels by Veena, I would like to know more about your jewellery.", "defaultCourier": "shiprocket", "WHATSAPP_NUMBER": "919747738193", "INSTAGRAM_HANDLE": "aarunyajewelsbyveena", "PAYMENT_PROVIDER": "razorpay", "DISPATCH_CUTOFF_HOUR": 16, "FREE_SHIPPING_THRESHOLD": 499, "HOME_STATE_PIN_PREFIXES": ["67", "68", "69"]}
\.


--
-- Data for Name: stock_ledger; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_ledger (id, at, product_id, variant_id, sku, name, color_key, change, reason, ref, note) FROM stdin;
1	2026-10-22 18:59:11.760085+00	pmvjwdzu6	pmvjwdzu6-gold	AJ-NK006-GLD	Gold Seven-Heart Charm Necklace	gold	10	adjust		Edited in product form
2	2026-10-24 06:05:45.341987+00	pmvlzwagr	pmvlzwagr-gold	AJ-BG001-GLD	Evil Eye Cable Bangle	gold	9	adjust		Opening stock
3	2026-10-24 06:05:45.395165+00	pmvlzwaia	pmvlzwaia-gold	AJ-RG001-GLD	Infinity Spark Ring	gold	14	adjust		Opening stock
4	2026-10-24 06:05:45.41642+00	pmvlzwaiw	pmvlzwaiw-gold	AJ-RG002-GLD	Heart Shine Ring	gold	12	adjust		Opening stock
5	2026-10-24 06:05:45.441219+00	pmvlzwajk	pmvlzwajk-gold	AJ-AN001-GLD	Ruby Leaf Anklet	gold	8	adjust		Opening stock
6	2026-10-24 06:05:45.466347+00	pmvlzwak9	pmvlzwak9-gold	AJ-HC001-GLD	Sleek Snake Chain Hipchain	gold	6	adjust		Opening stock
7	2026-10-24 06:12:42.681142+00	pmvlbofen	pmvlbofen-gold	AJ-NK-002-GLD	Gold Clover Charm Necklace	gold	12	adjust		New stock received · Demo opening stock
8	2026-10-24 06:12:42.695546+00	pmvlboffa	pmvlboffa-gold	AJ-NK-003-GLD	Gold Pearl Drop Necklace	gold	10	adjust		New stock received · Demo opening stock
9	2026-10-24 06:12:42.700223+00	pmvlboffm	pmvlboffm-gold	AJ-NK-004-GLD	Gold Star Charm Necklace	gold	14	adjust		New stock received · Demo opening stock
10	2026-10-25 04:04:50.600264+00	pmvnas359	pmvnas359-gold	AJ-NR004-GLD	Gold Cluster Nose Hoop	gold	10	adjust		New stock received · Opening stock, merchant confirmed
11	2026-10-25 04:04:50.626712+00	pmvnas34v	pmvnas34v-gold	AJ-NR003-GLD	Gold Floral Nose Pin	gold	10	adjust		New stock received · Opening stock, merchant confirmed
12	2026-10-25 04:04:50.647904+00	pmvnas34d	pmvnas34d-gold	AJ-NR002-GLD	Gold Stone Nose Stud	gold	10	adjust		New stock received · Opening stock, merchant confirmed
13	2026-10-25 04:04:50.664165+00	pmvnas33v	pmvnas33v-gold	AJ-NR001-GLD	Gold Stone Nose Hoop	gold	10	adjust		New stock received · Opening stock, merchant confirmed
14	2026-10-25 04:04:50.683605+00	pmvnas33h	pmvnas33h-gold	AJ-ER004-GLD	Gold Marquise Pearl Drop Earrings	gold	10	adjust		New stock received · Opening stock, merchant confirmed
15	2026-10-25 04:04:50.702866+00	pmvnas32z	pmvnas32z-gold	AJ-ER003-GLD	Gold Floral Jhumka Earrings	gold	10	adjust		New stock received · Opening stock, merchant confirmed
16	2026-10-25 04:04:50.719724+00	pmvnas32h	pmvnas32h-gold	AJ-ER002-GLD	Gold Floral Stud Earrings	gold	10	adjust		New stock received · Opening stock, merchant confirmed
17	2026-10-25 04:04:50.736647+00	pmvnas30s	pmvnas30s-gold	AJ-AN004-GLD	Gold Double Layer Anklet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
18	2026-10-25 04:04:50.755038+00	pmvnas309	pmvnas309-gold	AJ-AN003-GLD	Gold Star Charm Anklet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
19	2026-10-25 04:04:50.773985+00	pmvnas2zr	pmvnas2zr-gold	AJ-AN002-GLD	Gold Bead Chain Anklet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
20	2026-10-25 04:04:50.78999+00	pmvnas2zb	pmvnas2zb-gold	AJ-HC004-GLD	Gold Coin Charm Hip Chain	gold	10	adjust		New stock received · Opening stock, merchant confirmed
21	2026-10-25 04:04:50.809724+00	pmvnas2yu	pmvnas2yu-gold	AJ-HC003-GLD	Gold Layered Hip Chain	gold	10	adjust		New stock received · Opening stock, merchant confirmed
22	2026-10-25 04:04:50.828312+00	pmvnas2yc	pmvnas2yc-gold	AJ-HC002-GLD	Gold Beaded Waist Chain	gold	10	adjust		New stock received · Opening stock, merchant confirmed
23	2026-10-25 04:04:50.845887+00	pmvnas2xo	pmvnas2xo-gold	AJ-BG002-GLD	Gold Twisted Rope Bangle	gold	10	adjust		New stock received · Opening stock, merchant confirmed
24	2026-10-25 04:04:50.869152+00	pmvnas2wr	pmvnas2wr-gold	AJ-RG004-GLD	Gold Solitaire Sparkle Ring	gold	10	adjust		New stock received · Opening stock, merchant confirmed
25	2026-10-25 04:04:50.88849+00	pmvnas2v7	pmvnas2v7-gold	AJ-RG003-GLD	Gold Twist Band Ring	gold	10	adjust		New stock received · Opening stock, merchant confirmed
26	2026-10-25 04:04:50.905283+00	pmvnas322	pmvnas322-gold	AJ-ER001-GLD	Gold Classic Hoop Earrings	gold	10	adjust		New stock received · Opening stock, merchant confirmed
27	2026-10-25 04:10:19.797999+00	pmvnb7p73	pmvnb7p73-gold	AJ-HA002-GLD	Gold Floral Hand Harness	gold	10	adjust		New stock received · Opening stock, merchant confirmed
28	2026-10-25 04:10:19.823497+00	pmvnb7p6m	pmvnb7p6m-gold	AJ-HA001-GLD	Gold Minimal Hand Chain	gold	10	adjust		New stock received · Opening stock, merchant confirmed
29	2026-10-25 04:10:19.845244+00	pmvnb7p66	pmvnb7p66-gold	AJ-BR004-GLD	Gold Slim Cuff Bracelet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
30	2026-10-25 04:10:19.861642+00	pmvnb7p5m	pmvnb7p5m-gold	AJ-BR003-GLD	Gold Pearl Station Bracelet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
31	2026-10-25 04:10:19.87911+00	pmvnb7p4w	pmvnb7p4w-gold	AJ-BR002-GLD	Gold Heart Station Bracelet	gold	10	adjust		New stock received · Opening stock, merchant confirmed
32	2026-10-25 04:30:33.059944+00	pmvjwdzu6	pmvjwdzu6-gold	AJ-NK006-GLD	Gold Seven-Heart Charm Necklace	gold	-1	online	AJ1001	
33	2026-10-25 04:30:33.059944+00	pmvlboffa	pmvlboffa-gold	AJ-NK-003-GLD	Gold Pearl Drop Necklace	gold	-2	online	AJ1001	
34	2026-10-25 10:07:25.579883+00	pmvjwdzu6	pmvjwdzu6-gold	AJ-NK006-GLD	Gold Seven-Heart Charm Necklace	gold	-2	online	AJ1002	
35	2026-10-25 10:07:25.579883+00	pmvlboffa	pmvlboffa-gold	AJ-NK-003-GLD	Gold Pearl Drop Necklace	gold	-3	online	AJ1002	
\.


--
-- Data for Name: sub_category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sub_category (category_slug, slug, name, sort_order) FROM stdin;
bangles	classic-bangles	Classic Bangles	0
bangles	stone-bangles	Stone Bangles	1
bangles	minimal-bangles	Minimal Bangles	2
bangles	anti-tarnish-bangles	Anti-Tarnish Bangles	3
bangles	openable-bangles	Openable Bangles	4
earrings	stud-earrings	Stud Earrings	0
earrings	jhumkas	Jhumkas	1
nose-rings	nose-studs	Nose Studs	0
nose-rings	stone-nose-rings	Stone Nose Rings	1
bracelets	chain-bracelets	Chain Bracelets	0
bracelets	cuff-bracelets	Cuff Bracelets	1
hand-chains	minimal-hand-chains	Minimal Hand Chains	0
hand-chains	floral-hand-chains	Floral Hand Chains	1
rings	adjustable-rings	Adjustable Rings	0
rings	stone-rings	Stone Rings	1
rings	minimal-rings	Minimal Rings	2
hip-chains	minimal-hip-chains	Minimal Hip Chains	0
hip-chains	charm-hip-chains	Charm Hip Chains	1
anklets	minimal-anklets	Minimal Anklets	0
anklets	charm-anklets	Charm Anklets	1
anti-tarnish	anti-tarnish-neck-chains	Anti-Tarnish Neck Chains	0
anti-tarnish	anti-tarnish-earrings	Anti-Tarnish Earrings	1
anti-tarnish	anti-tarnish-bracelets	Anti-Tarnish Bracelets	2
anti-tarnish	anti-tarnish-rings	Anti-Tarnish Rings	3
necklaces	charm-necklaces	Charm Necklaces	0
necklaces	pearl-necklaces	Pearl Necklaces	1
\.


--
-- Data for Name: variant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.variant (id, product_id, color_key, sku, stock, sort_order) FROM stdin;
pmvnb7p6m-gold	pmvnb7p6m	gold	AJ-HA001-GLD	10	0
pmvnb7p66-gold	pmvnb7p66	gold	AJ-BR004-GLD	10	0
pmvnas359-gold	pmvnas359	gold	AJ-NR004-GLD	10	0
pmvnas34v-gold	pmvnas34v	gold	AJ-NR003-GLD	10	0
pmvnas34d-gold	pmvnas34d	gold	AJ-NR002-GLD	10	0
pmvnas33v-gold	pmvnas33v	gold	AJ-NR001-GLD	10	0
pmvnas33h-gold	pmvnas33h	gold	AJ-ER004-GLD	10	0
pmvnb7p5m-gold	pmvnb7p5m	gold	AJ-BR003-GLD	10	0
pmvnas32h-gold	pmvnas32h	gold	AJ-ER002-GLD	10	0
pmvnb7p73-gold	pmvnb7p73	gold	AJ-HA002-GLD	10	0
pmvnas30s-gold	pmvnas30s	gold	AJ-AN004-GLD	10	0
pmvnas2wr-gold	pmvnas2wr	gold	AJ-RG004-GLD	10	0
pmvnas309-gold	pmvnas309	gold	AJ-AN003-GLD	10	0
pmvnas2zb-gold	pmvnas2zb	gold	AJ-HC004-GLD	10	0
pmvnas2zr-gold	pmvnas2zr	gold	AJ-AN002-GLD	10	0
pmvnas32z-gold	pmvnas32z	gold	AJ-ER003-GLD	10	0
pmvlbofen-gold	pmvlbofen	gold	AJ-NK-002-GLD	12	0
pmvnas2yu-gold	pmvnas2yu	gold	AJ-HC003-GLD	10	0
pmvlboffm-gold	pmvlboffm	gold	AJ-NK-004-GLD	14	0
pmvnas2yc-gold	pmvnas2yc	gold	AJ-HC002-GLD	10	0
pmvlzwagr-gold	pmvlzwagr	gold	AJ-BG001-GLD	9	0
pmvnas2xo-gold	pmvnas2xo	gold	AJ-BG002-GLD	10	0
pmvlzwaia-gold	pmvlzwaia	gold	AJ-RG001-GLD	14	0
pmvlzwaiw-gold	pmvlzwaiw	gold	AJ-RG002-GLD	12	0
pmvnas2v7-gold	pmvnas2v7	gold	AJ-RG003-GLD	10	0
pmvlzwajk-gold	pmvlzwajk	gold	AJ-AN001-GLD	8	0
pmvlzwak9-gold	pmvlzwak9	gold	AJ-HC001-GLD	6	0
pmvjwdzu6-gold	pmvjwdzu6	gold	AJ-NK006-GLD	7	0
pmvlboffa-gold	pmvlboffa	gold	AJ-NK-003-GLD	5	0
pmvnb7p4w-gold	pmvnb7p4w	gold	AJ-BR002-GLD	10	0
pmvnas322-gold	pmvnas322	gold	AJ-ER001-GLD	10	0
\.


--
-- Data for Name: variant_image; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.variant_image (variant_id, slot, url) FROM stdin;
pmvnb7p6m-gold	0	/uploads/product/2026/10/gold-minimal-hand-chain-front-cc1defbe.jpg
pmvnb7p6m-gold	1	/uploads/product/2026/10/gold-minimal-hand-chain-on-model-18b109d9.jpg
pmvnb7p66-gold	0	/uploads/product/2026/10/gold-slim-cuff-bracelet-front-2f3a2680.jpg
pmvnb7p66-gold	1	/uploads/product/2026/10/gold-slim-cuff-bracelet-on-model-dbafae74.jpg
pmvnb7p5m-gold	0	/uploads/product/2026/10/gold-pearl-station-bracelet-front-bdc4b5bc.jpg
pmvnb7p5m-gold	1	/uploads/product/2026/10/gold-pearl-station-bracelet-on-model-66b86914.jpg
pmvjwdzu6-gold	0	/uploads/product/2026/10/gold-seven-heart-charm-necklace-87055024.jpg
pmvjwdzu6-gold	1	/uploads/product/2026/10/gold-seven-heart-charm-necklace-1c1e529d.jpg
pmvnb7p73-gold	0	/uploads/product/2026/10/gold-floral-hand-harness-front-c8138912.jpg
pmvnb7p73-gold	1	/uploads/product/2026/10/gold-floral-hand-harness-on-model-a3b4c43a.jpg
pmvnas2wr-gold	0	/uploads/product/2026/10/gold-solitaire-sparkle-ring-front-cbade409.jpg
pmvnas2wr-gold	1	/uploads/product/2026/10/gold-solitaire-sparkle-ring-on-model-f60e042b.jpg
pmvnas2zb-gold	0	/uploads/product/2026/10/gold-coin-charm-hip-chain-front-57b926ad.jpg
pmvnas2zb-gold	1	/uploads/product/2026/10/gold-coin-charm-hip-chain-on-model-59381e57.jpg
pmvnas32z-gold	0	/uploads/product/2026/10/gold-floral-jhumka-earrings-front-5fb764be.jpg
pmvnas32z-gold	1	/uploads/product/2026/10/gold-floral-jhumka-earrings-on-model-0ce2df95.jpg
pmvlbofen-gold	0	/uploads/product/2026/10/gold-clover-charm-necklace-front-1f4189cf.jpg
pmvlbofen-gold	1	/uploads/product/2026/10/gold-clover-charm-necklace-on-model-430e1d2f.jpg
pmvlboffm-gold	0	/uploads/product/2026/10/gold-star-charm-necklace-front-90c549d8.jpg
pmvlboffm-gold	1	/uploads/product/2026/10/gold-star-charm-necklace-on-model-df62be8a.jpg
pmvlzwagr-gold	0	/uploads/product/2026/10/evil-eye-cable-bangle-front-6bf26ba5.jpg
pmvlzwagr-gold	1	/uploads/product/2026/10/evil-eye-cable-bangle-on-model-9e482e61.jpg
pmvlzwaia-gold	0	/uploads/product/2026/10/infinity-spark-ring-front-b587759c.jpg
pmvlzwaia-gold	1	/uploads/product/2026/10/infinity-spark-ring-on-model-1c20e5a6.jpg
pmvlzwaiw-gold	0	/uploads/product/2026/10/heart-shine-ring-front-f9358d6c.jpg
pmvlzwaiw-gold	1	/uploads/product/2026/10/heart-shine-ring-on-model-cd0c6b8d.jpg
pmvlzwajk-gold	0	/uploads/product/2026/10/ruby-leaf-anklet-front-23673299.jpg
pmvlzwajk-gold	1	/uploads/product/2026/10/ruby-leaf-anklet-on-model-d7ce7f35.jpg
pmvlzwak9-gold	0	/uploads/product/2026/10/sleek-snake-chain-hipchain-front-7589ffd6.jpg
pmvlzwak9-gold	1	/uploads/product/2026/10/sleek-snake-chain-hipchain-on-model-14db76f1.jpg
pmvlboffa-gold	0	/uploads/product/2026/10/gold-pearl-drop-necklace-front-ca060448.jpg
pmvlboffa-gold	1	/uploads/product/2026/10/gold-pearl-drop-necklace-on-model-045b30f5.jpg
pmvnb7p4w-gold	0	/uploads/product/2026/10/gold-heart-station-bracelet-front-10181b92.jpg
pmvnb7p4w-gold	1	/uploads/product/2026/10/gold-heart-station-bracelet-on-model-2eca307b.jpg
pmvnas322-gold	0	/uploads/product/2026/10/gold-classic-hoop-earrings-front-9d1c0eb9.jpg
pmvnas322-gold	1	/uploads/product/2026/10/gold-classic-hoop-earrings-on-model-fd1d40f3.jpg
pmvnas359-gold	0	/uploads/product/2026/10/gold-cluster-nose-hoop-front-7af3e9ae.jpg
pmvnas359-gold	1	/uploads/product/2026/10/gold-cluster-nose-hoop-on-model-a3d46719.jpg
pmvnas34v-gold	0	/uploads/product/2026/10/gold-floral-nose-pin-front-89624f10.jpg
pmvnas34v-gold	1	/uploads/product/2026/10/gold-floral-nose-pin-on-model-53c0a83c.jpg
pmvnas34d-gold	0	/uploads/product/2026/10/gold-stone-nose-stud-front-b9378f8d.jpg
pmvnas34d-gold	1	/uploads/product/2026/10/gold-stone-nose-stud-on-model-2a9d596a.jpg
pmvnas33v-gold	0	/uploads/product/2026/10/gold-stone-nose-hoop-front-b90684a6.jpg
pmvnas33v-gold	1	/uploads/product/2026/10/gold-stone-nose-hoop-on-model-aa1b96ab.jpg
pmvnas33h-gold	0	/uploads/product/2026/10/gold-marquise-pearl-drop-earrings-front-997f9f15.jpg
pmvnas33h-gold	1	/uploads/product/2026/10/gold-marquise-pearl-drop-earrings-on-model-0a6efbae.jpg
pmvnas32h-gold	0	/uploads/product/2026/10/gold-floral-stud-earrings-front-a04e9ad1.jpg
pmvnas32h-gold	1	/uploads/product/2026/10/gold-floral-stud-earrings-on-model-531a565d.jpg
pmvnas30s-gold	0	/uploads/product/2026/10/gold-double-layer-anklet-front-12a00fa4.jpg
pmvnas30s-gold	1	/uploads/product/2026/10/gold-double-layer-anklet-on-model-faadd11d.jpg
pmvnas309-gold	0	/uploads/product/2026/10/gold-star-charm-anklet-front-37996e3d.jpg
pmvnas309-gold	1	/uploads/product/2026/10/gold-star-charm-anklet-on-model-33035865.jpg
pmvnas2zr-gold	0	/uploads/product/2026/10/gold-bead-chain-anklet-front-49aaecb6.jpg
pmvnas2zr-gold	1	/uploads/product/2026/10/gold-bead-chain-anklet-on-model-26e04198.jpg
pmvnas2yu-gold	0	/uploads/product/2026/10/gold-layered-hip-chain-front-bffebcd7.jpg
pmvnas2yu-gold	1	/uploads/product/2026/10/gold-layered-hip-chain-on-model-403d866b.jpg
pmvnas2yc-gold	0	/uploads/product/2026/10/gold-beaded-waist-chain-front-e7c39fe4.jpg
pmvnas2yc-gold	1	/uploads/product/2026/10/gold-beaded-waist-chain-on-model-76ebfa0e.jpg
pmvnas2xo-gold	0	/uploads/product/2026/10/gold-twisted-rope-bangle-front-1a94460d.jpg
pmvnas2xo-gold	1	/uploads/product/2026/10/gold-twisted-rope-bangle-on-model-e961db6b.jpg
pmvnas2v7-gold	0	/uploads/product/2026/10/gold-twist-band-ring-front-890a22f4.jpg
pmvnas2v7-gold	1	/uploads/product/2026/10/gold-twist-band-ring-on-model-93b3645e.jpg
\.


--
-- Name: announcement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.announcement_id_seq', 5, true);


--
-- Name: app_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_user_id_seq', 2, true);


--
-- Name: contact_message_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.contact_message_id_seq', 1, false);


--
-- Name: login_attempt_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.login_attempt_id_seq', 22, true);


--
-- Name: offer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.offer_id_seq', 1, false);


--
-- Name: order_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_history_id_seq', 2, true);


--
-- Name: order_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_item_id_seq', 4, true);


--
-- Name: password_reset_token_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.password_reset_token_id_seq', 1, false);


--
-- Name: product_spec_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_spec_id_seq', 244, true);


--
-- Name: return_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.return_history_id_seq', 1, false);


--
-- Name: stock_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_ledger_id_seq', 35, true);


--
-- Name: announcement announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: banner banner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banner
    ADD CONSTRAINT banner_pkey PRIMARY KEY (id);


--
-- Name: category_pairing category_pairing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_pairing
    ADD CONSTRAINT category_pairing_pkey PRIMARY KEY (category_slug, paired_slug);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (slug);


--
-- Name: color color_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color
    ADD CONSTRAINT color_pkey PRIMARY KEY (key);


--
-- Name: contact_message contact_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_message
    ADD CONSTRAINT contact_message_pkey PRIMARY KEY (id);


--
-- Name: login_attempt login_attempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempt
    ADD CONSTRAINT login_attempt_pkey PRIMARY KEY (id);


--
-- Name: offer offer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_pkey PRIMARY KEY (id);


--
-- Name: order_history order_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_pkey PRIMARY KEY (id);


--
-- Name: order_item order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_pkey PRIMARY KEY (id);


--
-- Name: order order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_pkey PRIMARY KEY (id);


--
-- Name: password_reset_token password_reset_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (id);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: product product_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_slug_key UNIQUE (slug);


--
-- Name: product_spec product_spec_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_spec
    ADD CONSTRAINT product_spec_pkey PRIMARY KEY (id);


--
-- Name: return_history return_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_history
    ADD CONSTRAINT return_history_pkey PRIMARY KEY (id);


--
-- Name: return_request return_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request
    ADD CONSTRAINT return_request_pkey PRIMARY KEY (id);


--
-- Name: setting setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setting
    ADD CONSTRAINT setting_pkey PRIMARY KEY (key);


--
-- Name: shipment shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_pkey PRIMARY KEY (order_id);


--
-- Name: stock_ledger stock_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_pkey PRIMARY KEY (id);


--
-- Name: sub_category sub_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_category
    ADD CONSTRAINT sub_category_pkey PRIMARY KEY (category_slug, slug);


--
-- Name: variant_image variant_image_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_image
    ADD CONSTRAINT variant_image_pkey PRIMARY KEY (variant_id, slot);


--
-- Name: variant variant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant
    ADD CONSTRAINT variant_pkey PRIMARY KEY (id);


--
-- Name: variant variant_product_id_color_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant
    ADD CONSTRAINT variant_product_id_color_key_key UNIQUE (product_id, color_key);


--
-- Name: contact_message_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_message_created_at_idx ON public.contact_message USING btree (created_at DESC);


--
-- Name: login_attempt_email_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempt_email_at_idx ON public.login_attempt USING btree (email, at DESC);


--
-- Name: login_attempt_ip_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempt_ip_at_idx ON public.login_attempt USING btree (ip, at DESC);


--
-- Name: order_access_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_access_token_idx ON public."order" USING btree (access_token);


--
-- Name: order_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_channel_status_idx ON public."order" USING btree (channel, status);


--
-- Name: order_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_created_at_idx ON public."order" USING btree (created_at DESC);


--
-- Name: order_cust_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_cust_phone_idx ON public."order" USING btree (cust_phone);


--
-- Name: order_history_order_id_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_history_order_id_at_idx ON public.order_history USING btree (order_id, at);


--
-- Name: order_item_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_item_order_id_idx ON public.order_item USING btree (order_id);


--
-- Name: password_reset_token_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_token_user_id_idx ON public.password_reset_token USING btree (user_id);


--
-- Name: product_category_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_category_slug_idx ON public.product USING btree (category_slug);


--
-- Name: product_spec_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_spec_product_id_idx ON public.product_spec USING btree (product_id);


--
-- Name: product_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_status_idx ON public.product USING btree (status);


--
-- Name: return_history_return_id_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_history_return_id_at_idx ON public.return_history USING btree (return_id, at);


--
-- Name: return_request_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_request_order_id_idx ON public.return_request USING btree (order_id);


--
-- Name: return_request_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX return_request_status_idx ON public.return_request USING btree (status);


--
-- Name: stock_ledger_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_at_idx ON public.stock_ledger USING btree (at DESC);


--
-- Name: stock_ledger_variant_id_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_ledger_variant_id_at_idx ON public.stock_ledger USING btree (variant_id, at DESC);


--
-- Name: variant_product_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_product_id_idx ON public.variant USING btree (product_id);


--
-- Name: category_pairing category_pairing_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_pairing
    ADD CONSTRAINT category_pairing_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.category(slug) ON DELETE CASCADE;


--
-- Name: order_history order_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: order_item order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: password_reset_token password_reset_token_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: product product_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.category(slug);


--
-- Name: product_spec product_spec_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_spec
    ADD CONSTRAINT product_spec_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;


--
-- Name: return_history return_history_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_history
    ADD CONSTRAINT return_history_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.return_request(id) ON DELETE CASCADE;


--
-- Name: return_request return_request_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_request
    ADD CONSTRAINT return_request_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: shipment shipment_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;


--
-- Name: sub_category sub_category_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_category
    ADD CONSTRAINT sub_category_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.category(slug) ON DELETE CASCADE;


--
-- Name: variant_image variant_image_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_image
    ADD CONSTRAINT variant_image_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.variant(id) ON DELETE CASCADE;


--
-- Name: variant variant_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant
    ADD CONSTRAINT variant_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict vOJg3e9b3erSY6AgAb1zXclmK2sYFtbpfIxl1L8QQMu3DwgdadqBSvil0Qkqfrk

