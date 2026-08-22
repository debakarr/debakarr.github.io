---
title: "[LeetCode] 347. Top K Frequent Elements"
date: "2019-08-02"
description: "Top K Frequent Elements Link to original Problem on LeetCode Given a non-empty array of integers, return the k most frequent elements. Example 1: Input: nums = [1,1,1,2,2,3], k = 2 Output: [1,2] Example 2: Input: nums = [1], k = 1 Output: [1] Note: You may assume k is always valid, 1 ≤ k ≤ number of unique elements. Your algorithm’s time complexity must be better than O(n log n), where n is the array’s size."
categories: ["Programming", "Algorithms", "Python"]
tags: ["Top K", "Frequent Elements", "Algorithm", "Python", "Tutorial"]
draft: false
---

### Top K Frequent Elements

[Link to original Problem on LeetCode](https://leetcode.com/problems/top-k-frequent-elements/)

Given a non-empty array of integers, return the **k** most frequent elements.

**Example 1:**

**Input:** nums = \[1,1,1,2,2,3\], k = 2 **Output:** \[1,2\]

**Example 2:**

**Input:** nums = \[1\], k = 1 **Output:** \[1\]

**Note:**

You may assume k is always valid, 1 ≤ k ≤ number of unique elements. Your algorithm’s time complexity must be better than O(n log n), where n is the array’s size.

**Company:** *Amazon*

**Solution (Using Python inbuilt feature - Counter):**

**Time Complexity:** O(n log n) **Space Complexity:** O(n)

```python
import collections

class Solution(object):
    def topKFrequent(self, nums, k):
        """
        :type nums: List[int]
        :type k: int
        :rtype: List[int]
        """
        # Counter(nums) return a Counter object which have key: value pairs of all the items: count of item.
        # most_common(k) method will return a list of tupple containing k most common element with their count
        return [x[0] for x in collections.Counter(nums).most_common(k)]
```

*[Internally Counter().most\_common(k) uses heapq.nlargest()](https://hg.python.org/cpython/file/c6880edaf6f3/Lib/collections.py)*

**Solution using heapq:**

**Time Complexity:** O(n log n) **Space Complexity:** O(n)

```python
import heapq

class Solution(object):
    def topKFrequent(self, nums, k):
        """
        :type nums: List[int]
        :type k: int
        :rtype: List[int]
        """
        
        numCount = {}
        
        for num in nums:
            numCount[num] = numCount.get(num, 0) + 1
            
        return heapq.nlargest(k, numCount, key=lambda x: numCount[x])
```
