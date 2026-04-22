'use client';
import React from 'react';

interface RichContentNode {
	type?: string;
	nodes?: RichContentNode[];
	textData?: { text?: string; decorations?: { type?: string }[] };
	headingData?: { level?: number };
	paragraphData?: unknown;
	imageData?: { image?: { src?: { url?: string } }; altText?: string };
	videoData?: { video?: { src?: { url?: string } } };
	linkData?: { link?: { url?: string; target?: string } };
	bulletedListData?: unknown;
	orderedListData?: unknown;
}

interface RichContent {
	nodes?: RichContentNode[];
	metadata?: unknown;
}

function renderNode(node: RichContentNode, key: number): React.ReactNode {
	const children = node.nodes?.map((child, i) => renderNode(child, i));

	switch (node.type) {
		case 'PARAGRAPH':
			return <p key={key}>{children}</p>;
		case 'HEADING': {
			const level = node.headingData?.level || 2;
			const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
			return <Tag key={key}>{children}</Tag>;
		}
		case 'TEXT': {
			let text: React.ReactNode = node.textData?.text || '';
			const decorations = node.textData?.decorations || [];
			for (const dec of decorations) {
				if (dec.type === 'BOLD') text = <strong>{text}</strong>;
				if (dec.type === 'ITALIC') text = <em>{text}</em>;
				if (dec.type === 'UNDERLINE') text = <u>{text}</u>;
			}
			return <React.Fragment key={key}>{text}</React.Fragment>;
		}
		case 'BULLETED_LIST':
			return <ul key={key}>{children}</ul>;
		case 'ORDERED_LIST':
			return <ol key={key}>{children}</ol>;
		case 'LIST_ITEM':
			return <li key={key}>{children}</li>;
		case 'BLOCKQUOTE':
			return <blockquote key={key}>{children}</blockquote>;
		case 'CODE_BLOCK':
			return (
				<pre key={key}>
					<code>{children}</code>
				</pre>
			);
		case 'IMAGE': {
			const url = node.imageData?.image?.src?.url;
			return url ? <img key={key} src={url} alt={node.imageData?.altText || ''} style={{ maxWidth: '100%' }} /> : null;
		}
		case 'VIDEO': {
			const url = node.videoData?.video?.src?.url;
			return url ? <video key={key} src={url} controls style={{ maxWidth: '100%' }} /> : null;
		}
		case 'DIVIDER':
			return <hr key={key} />;
		default:
			return children ? <div key={key}>{children}</div> : null;
	}
}

const RichContentViewer = ({ content }: { content?: RichContent | { nodes?: unknown[]; metadata?: unknown } }) => {
	if (!content?.nodes) return null;
	return <div>{(content.nodes as RichContentNode[]).map((node, i) => renderNode(node, i))}</div>;
};

export default RichContentViewer;
