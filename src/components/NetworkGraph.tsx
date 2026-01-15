import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useDatabase } from '../hooks/useDatabase';
import SpriteText from 'three-spritetext';

// --- HELPERS ---

const extractRagTokens = (post: any) => {
    try {
        const tags = JSON.parse(post.tags || "[]");
        if (Array.isArray(tags) && tags.length > 0) return tags;
        
        const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'is', 'with', 'by', 'from'];
        const cleanTitle = (post.title || "").toLowerCase().replace(/[^a-z0-9]+/g, ' ');
        const words = cleanTitle.split(/\s+/);
        
        return words.filter((w: string) => !stopWords.includes(w) && w.length > 2).slice(0, 5);
    } catch (e) {
        return ["general"];
    }
};

const getHeatColor = (count: number, max: number) => {
    const normalized = Math.min(count / Math.max(max, 1), 1);
    if (normalized < 0.25) return '#00aaff'; 
    if (normalized < 0.5) return '#00ff88'; 
    if (normalized < 0.75) return '#ffaa00'; 
    return '#ff0055'; 
};

const getRelevanceColor = (matchCount: number) => {
    if (matchCount === 0) return '#88ccff'; 
    if (matchCount === 1) return '#00ff88';
    if (matchCount === 2) return '#ffff00';
    return '#ff0055';
};

export const NetworkGraph: React.FC<{ onNodeClick: (node: any) => void }> = ({ onNodeClick }) => {
  const fgRef = useRef<any>(null);
  const { worker } = useDatabase();
  const isMounted = useRef(true);
  
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [matchedPosts, setMatchedPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Hover state ref to avoid re-renders
  const hoverState = useRef<{ node: any | null, highlightLinks: Set<any> }>({
      node: null, highlightLinks: new Set()
  });

  // Cleanup on unmount
  useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
  }, []);

  // --- DATA LOADING ---
  useEffect(() => {
    const buildGraph = async () => {
        if (!worker) return; // Wait for worker
        
        // Only set loading if we don't have data yet
        setGraphData(prev => {
            if (prev.nodes.length === 0) setIsLoading(true);
            return prev;
        });

        try {
            const posts = await worker.exec("SELECT * FROM posts ORDER BY date ASC");
            
            if (!isMounted.current) return;

            const nodes: any[] = [];
            const links: any[] = [];
            const tagCounts: Record<string, number> = {};

            // 1. ROOT
            nodes.push({ id: 'root', group: 'root', label: 'Timeline Start', fx: 0, fy: 0, fz: 0 });

            // 2. PROCESS NODES
            const processedMonths = new Set();
            let lastMonthId = 'root';
            let monthIndex = 0;
            const Y_SPACING = 40; 
            const SPIRAL_RADIUS = 30; 

            (posts || []).forEach((post: any) => {
                const dateObj = new Date(post.date);
                if (isNaN(dateObj.getTime())) return; // Skip invalid dates

                const monthKey = `${dateObj.getFullYear()}_${dateObj.getMonth()}`;
                const monthId = `month_${monthKey}`;
                const monthLabel = dateObj.toLocaleString('default', { month: 'short', year: '2-digit' });

                if (!processedMonths.has(monthId)) {
                    monthIndex++;
                    nodes.push({ 
                        id: monthId, group: 'month', label: monthLabel,
                        fx: 0, fy: monthIndex * Y_SPACING, fz: 0
                    });
                    links.push({ source: lastMonthId, target: monthId, type: 'trunk' });
                    lastMonthId = monthId;
                    processedMonths.add(monthId);
                }

                const day = dateObj.getDate();
                const angle = (day / 31) * Math.PI * 2; 
                const x = SPIRAL_RADIUS * Math.cos(angle);
                const z = SPIRAL_RADIUS * Math.sin(angle);
                const y = (monthIndex * Y_SPACING) + (day * 0.5); 

                const postId = `post_${post.id}`;
                
                // EXTRACT TAGS
                const tokens = extractRagTokens(post);
                const postTagIds = tokens.map((t: string) => `tag_${t}`);

                nodes.push({
                    id: postId, group: 'post', label: post.title,
                    details: post,
                    fx: x, fy: y, fz: z,
                    ragTags: postTagIds, // Store as Array
                    matchCount: 0, 
                    ...post 
                });

                links.push({ source: monthId, target: postId, type: 'spoke' });

                tokens.forEach((token: string) => {
                    const tagId = `tag_${token}`;
                    tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
                    
                    if (!nodes.find(n => n.id === tagId)) {
                        nodes.push({ id: tagId, group: 'tag', label: token, val: 1 });
                    }
                    links.push({ source: postId, target: tagId, type: 'rag' });
                });
            });

            // Metadata update
            const maxCount = Math.max(...Object.values(tagCounts));
            nodes.forEach(n => {
                if (n.group === 'tag') {
                    n.count = tagCounts[n.id];
                    n.maxCount = maxCount;
                    n.size = 2 + (n.count * 1.5); 
                    n._defaultColor = getHeatColor(n.count, n.maxCount); 
                }
            });

            // Safety Check: Filter Dangling Links
            const nodeIds = new Set(nodes.map(n => n.id));
            const validLinks = links.filter(l => {
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                return nodeIds.has(sourceId) && nodeIds.has(targetId);
            });

            if (isMounted.current) {
                setGraphData({ nodes: nodes as any, links: validLinks as any });
            }

        } catch (e) {
            console.error("Graph build error:", e);
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    };

    buildGraph();
  }, [worker]);

  // --- VISUAL REFRESH ---
  const refreshVisuals = useCallback(() => {
    if (!fgRef.current || !graphData.nodes.length) return;
    const { nodes } = graphData;
    
    // 1. Calculate Matches
    const matches: any[] = [];
    nodes.forEach((node: any) => {
        if (node.group === 'post') {
            let count = 0;
            if (selectedTags.size > 0 && Array.isArray(node.ragTags)) {
                node.ragTags.forEach((tagId: string) => {
                    if (selectedTags.has(tagId)) count++;
                });
            }
            node.matchCount = count;
            if (count > 0) matches.push(node);
        }
    });

    matches.sort((a, b) => b.matchCount - a.matchCount);
    setMatchedPosts(matches);

    // 2. Direct 3D Mutation (Safe)
    const scene = fgRef.current.scene();
    if (!scene) return;

    nodes.forEach((node: any) => {
        const obj = node.__threeObj;
        if (!obj) return;

        if (node.group === 'post') {
            const color = node.matchCount > 0 ? getRelevanceColor(node.matchCount) : '#88ccff';
            if (obj.material) obj.material.color.set(color);
            const targetScale = node.matchCount > 0 ? 1.5 : 1;
            obj.scale.setScalar(targetScale);
        }

        if (node.group === 'tag') {
            const isSelected = selectedTags.has(node.id);
            if (obj.material) {
                const baseColor = isSelected ? '#ffffff' : node._defaultColor;
                obj.material.color.set(baseColor);
                obj.material.emissive.set(baseColor);
                obj.material.emissiveIntensity = isSelected ? 1.0 : 0.3;
                obj.material.opacity = isSelected ? 1.0 : 0.7;
            }
            if (obj.children.length > 0) obj.children[0].visible = isSelected;
        }
    });

  }, [graphData, selectedTags]);

  useEffect(() => {
      refreshVisuals();
  }, [selectedTags, refreshVisuals]);

  const toggleTag = (tagId: string) => {
      const newTags = new Set(selectedTags);
      if (newTags.has(tagId)) newTags.delete(tagId);
      else newTags.add(tagId);
      setSelectedTags(newTags);
  };

  // --- HOVER ---
  const handleNodeHover = (node: any) => {
      const newHighlightsLinks = new Set<any>();

      if (node) {
          graphData.links.forEach((link: any) => {
              const srcId = link.source.id || link.source;
              const tgtId = link.target.id || link.target;
              if (srcId === node.id || tgtId === node.id) {
                  if (link.type === 'rag') newHighlightsLinks.add(link);
              }
          });
      }

      hoverState.current = { node, highlightLinks: newHighlightsLinks };
      document.body.style.cursor = node ? 'pointer' : 'default';
      
      // Force update component to refresh link visuals
      setGraphData(prev => ({ ...prev }));
  };

  const materials = useMemo(() => ({
    root: new THREE.MeshLambertMaterial({ color: '#8B4513' }),
    month: new THREE.MeshLambertMaterial({ color: '#A0522D' }),
  }), []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}>
      
      <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(circle at center, #222244 0%, #000000 100%)',
          zIndex: 0, pointerEvents: 'none'
      }} />

      {/* LOADING STATE */}
      {isLoading && (
        <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: '#00aaff', fontSize: '1.2rem', fontWeight: 'bold', zIndex: 10
        }}>
            Building Knowledge Graph...
        </div>
      )}

      {/* NO DATA STATE */}
      {!isLoading && graphData.nodes.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: '#666', fontSize: '1rem', zIndex: 10
        }}>
            No data found in database.
        </div>
      )}

      {/* GRAPH */}
      {!isLoading && graphData.nodes.length > 0 && (
          <ForceGraph3D
            ref={fgRef}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)" 
            enableNodeDrag={false} 
            
            d3Force="charge"
            d3VelocityDecay={0.1} 
            nodeLabel="label"
            
            nodeThreeObject={(node: any) => {
                if (node.group === 'root') return new THREE.Mesh(new THREE.SphereGeometry(10), materials.root);
                
                if (node.group === 'month') {
                    const group = new THREE.Group();
                    group.add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 20), materials.month));
                    try {
                        const sprite = new SpriteText(node.label);
                        sprite.color = '#deb887';
                        sprite.textHeight = 6;
                        sprite.position.set(8, 0, 0);
                        group.add(sprite);
                    } catch(e) {}
                    return group;
                }

                if (node.group === 'post') {
                    return new THREE.Mesh(
                        new THREE.SphereGeometry(3),
                        new THREE.MeshLambertMaterial({ color: '#88ccff' })
                    );
                }

                if (node.group === 'tag') {
                    const mesh = new THREE.Mesh(
                        new THREE.IcosahedronGeometry(node.size, 0),
                        new THREE.MeshStandardMaterial({ 
                            color: node._defaultColor, 
                            emissive: node._defaultColor, 
                            emissiveIntensity: 0.3,
                            transparent: true,
                            opacity: 0.7
                        })
                    );
                    const ring = new THREE.Mesh(
                        new THREE.TorusGeometry(node.size + 4, 0.5, 16, 32),
                        new THREE.MeshBasicMaterial({ color: '#ff0055' })
                    );
                    ring.visible = false;
                    mesh.add(ring);
                    return mesh;
                }
            }}

            linkWidth={(link: any) => {
                if (link.type === 'rag') {
                    const srcId = link.source.id || link.source;
                    const tgtId = link.target.id || link.target;
                    
                    const isSelected = selectedTags.has(srcId) || selectedTags.has(tgtId);
                    const isHovered = hoverState.current.highlightLinks.has(link);
                    
                    if (isSelected) return 1.5;
                    if (isHovered) return 1.0;
                    return 0; 
                }
                return 1; 
            }}
            
            linkColor={(link: any) => {
                if (link.type === 'rag') {
                    const srcId = link.source.id || link.source;
                    const tgtId = link.target.id || link.target;
                    
                    const isSelected = selectedTags.has(srcId) || selectedTags.has(tgtId);
                    if (isSelected) return '#ff0055';
                    
                    const isHovered = hoverState.current.highlightLinks.has(link);
                    if (isHovered) return '#ffffff';

                    return 'transparent';
                }
                if (link.type === 'trunk') return '#8B4513';
                if (link.type === 'spoke') return '#666666'; 
                return '#333333';
            }}

            onNodeHover={handleNodeHover}
            
            onNodeClick={(node: any) => {
                if (node.group === 'tag') {
                    toggleTag(node.id);
                    return;
                }
                if(node.group === 'post') {
                    onNodeClick({ id: node.id, label: node.label, details: node.details, group: 3 });
                    const dist = 60;
                    const distRatio = 1 + dist/Math.hypot(node.x, node.y, node.z);
                    if (fgRef.current) {
                        fgRef.current.cameraPosition(
                            { x: node.x * distRatio, y: node.y * distRatio + 10, z: node.z * distRatio }, 
                            node, 
                            1500
                        );
                    }
                }
            }}
          />
      )}
      
      {/* UI PANEL */}
      <div style={{ position: 'absolute', top: 20, right: 20, width: '300px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 5 }}>
        
        {selectedTags.size > 0 && (
            <div style={{ background: '#1a1a1a', border: '1px solid #ff0055', borderRadius: '8px', padding: '15px', boxShadow: '0 0 20px rgba(255, 0, 85, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>Filters ({selectedTags.size})</h3>
                    <button onClick={() => setSelectedTags(new Set())} style={{ background: 'transparent', border: 'none', color: '#ff0055', cursor: 'pointer' }}>Clear</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {Array.from(selectedTags).map(tagId => (
                        <span key={tagId} onClick={() => toggleTag(tagId)} style={{ background: '#ff0055', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                            {tagId.replace('tag_', '')} ✕
                        </span>
                    ))}
                </div>
            </div>
        )}

        {selectedTags.size > 0 && (
            <div style={{ background: 'rgba(20, 20, 20, 0.95)', border: '1px solid #333', borderRadius: '8px', padding: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#ccc', fontSize: '0.9rem' }}>
                    {matchedPosts.length} Matches Found
                </h4>
                {matchedPosts.length === 0 && <div style={{color:'#666', fontSize:'0.8rem'}}>Try selecting different tags.</div>}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {matchedPosts.map(post => (
                        <div 
                            key={post.id} 
                            onClick={() => onNodeClick({ id: post.id, label: post.label, details: post.details, group: 3 })}
                            style={{ 
                                padding: '10px', 
                                background: '#111', 
                                borderRadius: '4px', 
                                cursor: 'pointer', 
                                borderLeft: `3px solid ${getRelevanceColor(post.matchCount)}`
                            }}
                        >
                            <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}>{post.label}</div>
                            <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{new Date(post.details.date).toLocaleDateString()}</span>
                                <span style={{ color: getRelevanceColor(post.matchCount) }}>
                                    {post.matchCount} Matches
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};